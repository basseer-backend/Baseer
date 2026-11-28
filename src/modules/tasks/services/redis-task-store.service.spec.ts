import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { AppErrorCode } from '../../../common/constants/error-codes';
import { AppException } from '../../../common/exceptions/app.exception';
import { RedisService } from '../../../common/redis/redis.service';
import { TaskStatus } from '../enums/task-status.enum';
import { RedisTaskState } from '../interfaces/redis-task-state.interface';
import { RedisTaskStoreService } from './redis-task-store.service';

describe('RedisTaskStoreService', () => {
  let service: RedisTaskStoreService;
  let mockRedisService: {
    get: ReturnType<typeof vi.fn>;
    setWithTtl: ReturnType<typeof vi.fn>;
    setPreservingTtl: ReturnType<typeof vi.fn>;
    ttl: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
    evalScript: ReturnType<typeof vi.fn>;
  };
  let mockConfigService: {
    get: ReturnType<typeof vi.fn>;
  };

  const mockTaskId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';
  const otherUserId = '99999999-9999-9999-9999-999999999999';

  const createSampleTaskState = (
    overrides: Partial<RedisTaskState> = {},
  ): RedisTaskState => ({
    id: mockTaskId,
    userId: mockUserId,
    clientTaskId: '33333333-3333-3333-3333-333333333333',
    requestId: '44444444-4444-4444-4444-444444444444',
    taskType: 'OCR_DOCUMENT',
    status: TaskStatus.PENDING,
    processingTimeMs: null,
    errorCode: null,
    result: null,
    createdAt: '2026-11-27T12:00:00.000Z',
    completedAt: null,
    expiresAt: Math.floor(Date.now() / 1000) + 7200,
    ...overrides,
  });

  beforeEach(() => {
    mockRedisService = {
      get: vi.fn(),
      setWithTtl: vi.fn(),
      setPreservingTtl: vi.fn(),
      ttl: vi.fn(),
      del: vi.fn(),
      evalScript: vi.fn(),
    };

    mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === 'REDIS_KEY_PREFIX') return 'baseer:task:';
        if (key === 'REDIS_TASK_TTL_SECONDS') return '7200';
        return undefined;
      }),
    };

    service = new RedisTaskStoreService(
      mockRedisService as unknown as RedisService,
      mockConfigService as unknown as ConfigService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTask', () => {
    it('sets key in Redis with exact 7200-second TTL and computes expiresAt', async () => {
      const taskInput = createSampleTaskState();
      mockRedisService.setWithTtl.mockResolvedValueOnce(undefined);

      const created = await service.createTask(taskInput, 7200);

      expect(created.id).toBe(mockTaskId);
      expect(created.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000) + 7100);
      expect(mockRedisService.setWithTtl).toHaveBeenCalledWith(
        `baseer:task:${mockTaskId}`,
        expect.stringContaining(mockTaskId),
        7200,
      );
    });
  });

  describe('getTask (Polling)', () => {
    it('retrieves existing pending task from Redis', async () => {
      const task = createSampleTaskState({ status: TaskStatus.PENDING });
      mockRedisService.get.mockResolvedValueOnce(JSON.stringify(task));

      const result = await service.getTask(mockTaskId, mockUserId);
      expect(result.id).toBe(mockTaskId);
      expect(result.status).toBe(TaskStatus.PENDING);
    });

    it('retrieves existing processing task from Redis', async () => {
      const task = createSampleTaskState({ status: TaskStatus.PROCESSING });
      mockRedisService.get.mockResolvedValueOnce(JSON.stringify(task));

      const result = await service.getTask(mockTaskId, mockUserId);
      expect(result.status).toBe(TaskStatus.PROCESSING);
    });

    it('retrieves completed task with temporary extracted result text from Redis', async () => {
      const ocrResult = {
        detectedLanguage: 'en',
        extractedText: 'Prescription text sample',
        arabicSimplifiedText: 'نص وصفة طبية',
        confidence: 0.98,
      };
      const task = createSampleTaskState({
        status: TaskStatus.COMPLETED,
        result: ocrResult,
        completedAt: '2026-11-27T12:00:05.000Z',
        processingTimeMs: 145,
      });
      mockRedisService.get.mockResolvedValueOnce(JSON.stringify(task));

      const result = await service.getTask(mockTaskId, mockUserId);
      expect(result.status).toBe(TaskStatus.COMPLETED);
      expect(result.result).toEqual(ocrResult);
    });

    it('retrieves failed task from Redis', async () => {
      const task = createSampleTaskState({
        status: TaskStatus.FAILED,
        errorCode: 'ERR_IMAGE_BLURRY',
        completedAt: '2026-11-27T12:00:02.000Z',
      });
      mockRedisService.get.mockResolvedValueOnce(JSON.stringify(task));

      const result = await service.getTask(mockTaskId, mockUserId);
      expect(result.status).toBe(TaskStatus.FAILED);
      expect(result.errorCode).toBe('ERR_IMAGE_BLURRY');
    });

    it('retrieves cancelled task from Redis', async () => {
      const task = createSampleTaskState({
        status: TaskStatus.CANCELLED,
        completedAt: '2026-11-27T12:00:03.000Z',
      });
      mockRedisService.get.mockResolvedValueOnce(JSON.stringify(task));

      const result = await service.getTask(mockTaskId, mockUserId);
      expect(result.status).toBe(TaskStatus.CANCELLED);
    });

    it('throws ERR_NOT_FOUND when task is nonexistent or expired', async () => {
      mockRedisService.get.mockResolvedValueOnce(null);

      await expect(service.getTask('nonexistent-id', mockUserId)).rejects.toMatchObject({
        errorCode: AppErrorCode.NOT_FOUND,
      });
    });

    it('throws ERR_NOT_FOUND when task belongs to another user (prevents tenant leakage)', async () => {
      const task = createSampleTaskState({ userId: mockUserId });
      mockRedisService.get.mockResolvedValueOnce(JSON.stringify(task));

      await expect(service.getTask(mockTaskId, otherUserId)).rejects.toMatchObject({
        errorCode: AppErrorCode.NOT_FOUND,
      });
    });

    it('propagates ERR_SERVICE_UNAVAILABLE when Redis connection fails', async () => {
      mockRedisService.get.mockRejectedValueOnce(
        new AppException(
          AppErrorCode.SERVICE_UNAVAILABLE,
          'Task state service temporarily unavailable.',
        ),
      );

      await expect(service.getTask(mockTaskId, mockUserId)).rejects.toMatchObject({
        errorCode: AppErrorCode.SERVICE_UNAVAILABLE,
      });
    });
  });

  describe('cancelTask (Cancellation)', () => {
    it('cancels pending task atomically in Redis', async () => {
      const cancelledTask = createSampleTaskState({
        status: TaskStatus.CANCELLED,
        completedAt: '2026-11-27T12:01:00.000Z',
      });
      mockRedisService.evalScript.mockResolvedValueOnce(
        JSON.stringify({ ok: true, task: cancelledTask, changed: true }),
      );

      const result = await service.cancelTask(mockTaskId, mockUserId);
      expect(result.status).toBe(TaskStatus.CANCELLED);
      expect(mockRedisService.evalScript).toHaveBeenCalled();
    });

    it('cancels processing task atomically in Redis', async () => {
      const cancelledTask = createSampleTaskState({
        status: TaskStatus.CANCELLED,
        completedAt: '2026-11-27T12:01:00.000Z',
      });
      mockRedisService.evalScript.mockResolvedValueOnce(
        JSON.stringify({ ok: true, task: cancelledTask, changed: true }),
      );

      const result = await service.cancelTask(mockTaskId, mockUserId);
      expect(result.status).toBe(TaskStatus.CANCELLED);
    });

    it('repeating cancel on an already cancelled task is safe and idempotent (200 OK)', async () => {
      const cancelledTask = createSampleTaskState({
        status: TaskStatus.CANCELLED,
        completedAt: '2026-11-27T12:01:00.000Z',
      });
      mockRedisService.evalScript.mockResolvedValueOnce(
        JSON.stringify({ ok: true, task: cancelledTask, changed: false }),
      );

      const result = await service.cancelTask(mockTaskId, mockUserId);
      expect(result.status).toBe(TaskStatus.CANCELLED);
    });

    it('rejects cancellation of an already completed task with ERR_BAD_REQUEST', async () => {
      mockRedisService.evalScript.mockResolvedValueOnce(
        JSON.stringify({
          ok: false,
          code: 'INVALID_TRANSITION',
          task: { status: TaskStatus.COMPLETED },
          message: 'Cannot cancel task in status COMPLETED',
        }),
      );

      await expect(service.cancelTask(mockTaskId, mockUserId)).rejects.toMatchObject({
        errorCode: AppErrorCode.BAD_REQUEST,
      });
    });

    it('rejects cancellation of an already failed task with ERR_BAD_REQUEST', async () => {
      mockRedisService.evalScript.mockResolvedValueOnce(
        JSON.stringify({
          ok: false,
          code: 'INVALID_TRANSITION',
          task: { status: TaskStatus.FAILED },
          message: 'Cannot cancel task in status FAILED',
        }),
      );

      await expect(service.cancelTask(mockTaskId, mockUserId)).rejects.toMatchObject({
        errorCode: AppErrorCode.BAD_REQUEST,
      });
    });

    it('throws ERR_NOT_FOUND when cancelling nonexistent or expired task', async () => {
      mockRedisService.evalScript.mockResolvedValueOnce(
        JSON.stringify({ ok: false, code: 'NOT_FOUND', message: 'Task not found or expired' }),
      );

      await expect(service.cancelTask('missing-id', mockUserId)).rejects.toMatchObject({
        errorCode: AppErrorCode.NOT_FOUND,
      });
    });

    it('throws ERR_NOT_FOUND when cancelling another user task', async () => {
      mockRedisService.evalScript.mockResolvedValueOnce(
        JSON.stringify({ ok: false, code: 'NOT_FOUND', message: 'Task not found or expired' }),
      );

      await expect(service.cancelTask(mockTaskId, otherUserId)).rejects.toMatchObject({
        errorCode: AppErrorCode.NOT_FOUND,
      });
    });

    it('rejects subsequent completion once task is marked CANCELLED', async () => {
      mockRedisService.evalScript.mockResolvedValueOnce(
        JSON.stringify({
          ok: false,
          code: 'ALREADY_CANCELLED',
          message: 'Task is already cancelled',
        }),
      );

      await expect(
        service.transitionStatus(mockTaskId, TaskStatus.COMPLETED),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.BAD_REQUEST,
      });
    });

    it('propagates ERR_SERVICE_UNAVAILABLE when Redis is down during cancel', async () => {
      mockRedisService.evalScript.mockRejectedValueOnce(
        new AppException(
          AppErrorCode.SERVICE_UNAVAILABLE,
          'Task state service temporarily unavailable.',
        ),
      );

      await expect(service.cancelTask(mockTaskId, mockUserId)).rejects.toMatchObject({
        errorCode: AppErrorCode.SERVICE_UNAVAILABLE,
      });
    });
  });

  describe('completeWithResult (Result Text in Redis Only)', () => {
    it('stores extracted text in Redis result payload and sets status to COMPLETED', async () => {
      const ocrPayload = {
        detectedLanguage: 'ar',
        extractedText: 'بنادول إكسترا',
        arabicSimplifiedText: 'بنادول إكسترا 500 مجم',
        confidence: 0.99,
      };
      const completedTask = createSampleTaskState({
        status: TaskStatus.COMPLETED,
        result: ocrPayload,
        processingTimeMs: 250,
      });

      mockRedisService.evalScript.mockResolvedValueOnce(
        JSON.stringify({ ok: true, task: completedTask, changed: true }),
      );

      const result = await service.completeWithResult(mockTaskId, ocrPayload, 250);
      expect(result.status).toBe(TaskStatus.COMPLETED);
      expect(result.result).toEqual(ocrPayload);
      expect(result.processingTimeMs).toBe(250);
    });
  });
});
