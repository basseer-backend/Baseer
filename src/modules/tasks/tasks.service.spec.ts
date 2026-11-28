import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppErrorCode } from '../../common/constants/error-codes';
import { AppException } from '../../common/exceptions/app.exception';
import { TaskExecution } from '../../database/entities/task-execution.entity';
import { TaskExecutionRepository } from '../../database/repositories/task-execution.repository';
import { CreateTaskDto } from './dto/create-task.dto';
import {
  ALLOWED_TASK_TRANSITIONS,
  canTransition,
  TaskStatus,
  TERMINAL_TASK_STATUSES,
} from './enums/task-status.enum';
import { TasksService } from './tasks.service';
import { RedisTaskStoreService } from './services/redis-task-store.service';
import { RedisTaskState } from './interfaces/redis-task-state.interface';

describe('TasksService', () => {
  let service: TasksService;
  let repo: {
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  let redisTaskStore: {
    createTask: ReturnType<typeof vi.fn>;
    getTask: ReturnType<typeof vi.fn>;
    cancelTask: ReturnType<typeof vi.fn>;
    transitionStatus: ReturnType<typeof vi.fn>;
    completeWithResult: ReturnType<typeof vi.fn>;
  };

  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockTaskId = '22222222-2222-2222-2222-222222222222';
  const mockClientTaskId = '33333333-3333-3333-3333-333333333333';
  const mockRequestId = '44444444-4444-4444-4444-444444444444';

  const createMockTask = (
    overrides: Partial<TaskExecution> = {},
  ): TaskExecution => {
    const task = new TaskExecution();
    task.id = mockTaskId;
    task.userId = mockUserId;
    task.clientTaskId = mockClientTaskId;
    task.requestId = mockRequestId;
    task.taskType = 'OCR_DOCUMENT';
    task.status = TaskStatus.PENDING;
    task.processingTimeMs = null;
    task.errorCode = null;
    task.createdAt = new Date('2026-11-22T10:00:00Z');
    task.completedAt = null;
    return Object.assign(task, overrides);
  };

  const createMockRedisState = (
    overrides: Partial<RedisTaskState> = {},
  ): RedisTaskState => ({
    id: mockTaskId,
    userId: mockUserId,
    clientTaskId: mockClientTaskId,
    requestId: mockRequestId,
    taskType: 'OCR_DOCUMENT',
    status: TaskStatus.PENDING,
    processingTimeMs: null,
    errorCode: null,
    result: null,
    createdAt: '2026-11-22T10:00:00.000Z',
    completedAt: null,
    expiresAt: Math.floor(Date.now() / 1000) + 7200,
    ...overrides,
  });

  beforeEach(() => {
    repo = {
      findOne: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    };

    redisTaskStore = {
      createTask: vi.fn(),
      getTask: vi.fn(),
      cancelTask: vi.fn(),
      transitionStatus: vi.fn(),
      completeWithResult: vi.fn(),
    };

    service = new TasksService(
      repo as unknown as TaskExecutionRepository,
      redisTaskStore as unknown as RedisTaskStoreService,
    );
  });

  describe('Transition rules & matrix (Database parity)', () => {
    it('should have exact terminal statuses', () => {
      expect(TERMINAL_TASK_STATUSES).toEqual([
        TaskStatus.COMPLETED,
        TaskStatus.FAILED,
        TaskStatus.CANCELLED,
      ]);
    });

    it('should match ALLOWED_TASK_TRANSITIONS according to DB enforce_task_status_transition', () => {
      expect(ALLOWED_TASK_TRANSITIONS).toEqual({
        [TaskStatus.PENDING]: [
          TaskStatus.PROCESSING,
          TaskStatus.COMPLETED,
          TaskStatus.FAILED,
          TaskStatus.CANCELLED,
        ],
        [TaskStatus.PROCESSING]: [
          TaskStatus.COMPLETED,
          TaskStatus.FAILED,
          TaskStatus.CANCELLED,
        ],
        [TaskStatus.COMPLETED]: [],
        [TaskStatus.FAILED]: [],
        [TaskStatus.CANCELLED]: [],
      });
    });

    it('should verify the complete transition matrix with canTransition', () => {
      const allStatuses = Object.values(TaskStatus);
      for (const from of allStatuses) {
        for (const to of allStatuses) {
          const result = canTransition(from, to);
          if (from === to) {
            expect(result).toBe(true);
          } else if (from === TaskStatus.PENDING) {
            expect(result).toBe(true);
          } else if (from === TaskStatus.PROCESSING) {
            if (to === TaskStatus.PENDING) {
              expect(result).toBe(false);
            } else {
              expect(result).toBe(true);
            }
          } else {
            expect(result).toBe(false);
          }
        }
      }
    });
  });

  describe('createOrGet (Idempotency and Task Creation with Redis 7200s TTL)', () => {
    const dto: CreateTaskDto = {
      clientTaskId: mockClientTaskId,
      taskType: 'OCR_DOCUMENT',
    };

    it('creates new task in DB and initializes Redis state with 7200s TTL', async () => {
      repo.findOne.mockResolvedValueOnce(null);
      const createdTask = createMockTask();
      repo.create.mockResolvedValueOnce(createdTask);
      redisTaskStore.createTask.mockResolvedValueOnce(createMockRedisState());

      const result = await service.createOrGet(mockUserId, dto);

      expect(repo.create).toHaveBeenCalled();
      expect(redisTaskStore.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          id: createdTask.id,
          userId: mockUserId,
          clientTaskId: dto.clientTaskId,
          status: TaskStatus.PENDING,
        }),
      );
      expect(result.created).toBe(true);
      expect(result.task).toBe(createdTask);
    });

    it('rolls back PostgreSQL record if Redis initialization fails (Constraint 7)', async () => {
      repo.findOne.mockResolvedValueOnce(null);
      const createdTask = createMockTask();
      repo.create.mockResolvedValueOnce(createdTask);
      repo.deleteMany.mockResolvedValueOnce({ affected: 1 });

      const redisError = new AppException(
        AppErrorCode.SERVICE_UNAVAILABLE,
        'Redis unavailable',
      );
      redisTaskStore.createTask.mockRejectedValueOnce(redisError);

      await expect(service.createOrGet(mockUserId, dto)).rejects.toMatchObject({
        errorCode: AppErrorCode.SERVICE_UNAVAILABLE,
      });

      expect(repo.deleteMany).toHaveBeenCalledWith({ id: createdTask.id });
    });

    it('returns existing task when clientTaskId already exists (created = false)', async () => {
      const existingTask = createMockTask();
      repo.findOne.mockResolvedValueOnce(existingTask);
      redisTaskStore.getTask.mockResolvedValueOnce(createMockRedisState());

      const result = await service.createOrGet(mockUserId, dto);

      expect(repo.create).not.toHaveBeenCalled();
      expect(result.created).toBe(false);
      expect(result.task).toBe(existingTask);
    });

    it('throws BAD_REQUEST when clientTaskId already exists but with different taskType', async () => {
      const existingTask = createMockTask({ taskType: 'NAVIGATION_ROUTE' });
      repo.findOne.mockResolvedValueOnce(existingTask);

      await expect(service.createOrGet(mockUserId, dto)).rejects.toMatchObject({
        errorCode: AppErrorCode.BAD_REQUEST,
      });
    });
  });

  describe('getForUser (Single Source of Truth: Redis)', () => {
    it('retrieves task strictly from Redis without querying PostgreSQL', async () => {
      const redisState = createMockRedisState({ status: TaskStatus.PROCESSING });
      redisTaskStore.getTask.mockResolvedValueOnce(redisState);

      const result = await service.getForUser(mockUserId, mockTaskId);

      expect(result).toBe(redisState);
      expect(redisTaskStore.getTask).toHaveBeenCalledWith(mockTaskId, mockUserId);
      expect(repo.findOne).not.toHaveBeenCalled(); // PostgreSQL NOT queried as fallback!
    });

    it('propagates NOT_FOUND from Redis without falling back to DB', async () => {
      redisTaskStore.getTask.mockRejectedValueOnce(
        new AppException(AppErrorCode.NOT_FOUND, 'Task not found or expired'),
      );

      await expect(service.getForUser(mockUserId, mockTaskId)).rejects.toMatchObject({
        errorCode: AppErrorCode.NOT_FOUND,
      });
      expect(repo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('cancel (Atomic Cancellation via Redis)', () => {
    it('cancels task in Redis and syncs PostgreSQL best-effort', async () => {
      const cancelledState = createMockRedisState({
        status: TaskStatus.CANCELLED,
        completedAt: '2026-11-22T10:05:00Z',
      });
      redisTaskStore.cancelTask.mockResolvedValueOnce(cancelledState);
      repo.updateMany.mockResolvedValue({ affected: 1 });

      const result = await service.cancel(mockUserId, mockTaskId);

      expect(result).toBe(cancelledState);
      expect(redisTaskStore.cancelTask).toHaveBeenCalledWith(mockTaskId, mockUserId);
      expect(repo.updateMany).toHaveBeenCalledWith(
        { id: mockTaskId, status: TaskStatus.PENDING },
        expect.objectContaining({ status: TaskStatus.CANCELLED }),
      );
    });

    it('propagates error when task is in non-cancellable state (e.g. COMPLETED)', async () => {
      redisTaskStore.cancelTask.mockRejectedValueOnce(
        new AppException(
          AppErrorCode.BAD_REQUEST,
          'Cannot cancel task in status "COMPLETED".',
        ),
      );

      await expect(service.cancel(mockUserId, mockTaskId)).rejects.toMatchObject({
        errorCode: AppErrorCode.BAD_REQUEST,
      });
    });
  });

  describe('markCompleted (Extracted text in Redis ONLY)', () => {
    it('stores result in Redis and never writes extracted text to PostgreSQL', async () => {
      const ocrResult = {
        detectedLanguage: 'en',
        extractedText: 'Prescription text sample',
        arabicSimplifiedText: 'نص وصفة طبية',
        confidence: 0.98,
      };
      const completedState = createMockRedisState({
        status: TaskStatus.COMPLETED,
        result: ocrResult,
        processingTimeMs: 150,
      });
      redisTaskStore.completeWithResult.mockResolvedValueOnce(completedState);
      repo.updateMany.mockResolvedValue({ affected: 1 });

      const result = await service.markCompleted(mockTaskId, ocrResult, 150);

      expect(result).toBe(completedState);
      expect(redisTaskStore.completeWithResult).toHaveBeenCalledWith(
        mockTaskId,
        ocrResult,
        150,
      );

      // Verify PostgreSQL update contains ONLY operational metadata, NOT extractedText!
      const calls = repo.updateMany.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        const payload = call[1];
        expect(payload).not.toHaveProperty('result');
        expect(payload).not.toHaveProperty('extractedText');
        expect(payload).not.toHaveProperty('arabicSimplifiedText');
        expect(payload.status).toBe(TaskStatus.COMPLETED);
      }
    });
  });
});
