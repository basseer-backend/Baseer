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

describe('TasksService', () => {
  let service: TasksService;
  let repo: {
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
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

  beforeEach(() => {
    repo = {
      findOne: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    };

    service = new TasksService(repo as unknown as TaskExecutionRepository);
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

      // Expected table from enforce_task_status_transition:
      // Same status transition (from === to) is always allowed (returns true)
      // PENDING can transition to PROCESSING, COMPLETED, FAILED, CANCELLED
      // PROCESSING can transition to COMPLETED, FAILED, CANCELLED
      // COMPLETED, FAILED, CANCELLED can only transition to themselves
      for (const from of allStatuses) {
        for (const to of allStatuses) {
          const result = canTransition(from, to);
          if (from === to) {
            expect(result).toBe(true);
          } else if (from === TaskStatus.PENDING) {
            expect(result).toBe(true); // PENDING can go to any of the 4
          } else if (from === TaskStatus.PROCESSING) {
            if (to === TaskStatus.PENDING) {
              expect(result).toBe(false);
            } else {
              expect(result).toBe(true);
            }
          } else {
            // COMPLETED, FAILED, CANCELLED
            expect(result).toBe(false);
          }
        }
      }
    });
  });

  describe('createOrGet (Idempotency and Task Creation)', () => {
    const dto: CreateTaskDto = {
      clientTaskId: mockClientTaskId,
      taskType: 'OCR_DOCUMENT',
    };

    it('should create a new task when clientTaskId does not exist (created = true)', async () => {
      repo.findOne.mockResolvedValueOnce(null);
      const createdTask = createMockTask();
      repo.create.mockResolvedValueOnce(createdTask);

      const result = await service.createOrGet(mockUserId, dto);

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { userId: mockUserId, clientTaskId: dto.clientTaskId },
      });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          clientTaskId: dto.clientTaskId,
          taskType: dto.taskType,
          status: TaskStatus.PENDING,
          requestId: expect.any(String),
        }),
      );
      expect(result.created).toBe(true);
      expect(result.task).toBe(createdTask);
    });

    it('should return existing task when clientTaskId already exists with same taskType (created = false)', async () => {
      const existingTask = createMockTask();
      repo.findOne.mockResolvedValueOnce(existingTask);

      const result = await service.createOrGet(mockUserId, dto);

      expect(repo.findOne).toHaveBeenCalledTimes(1);
      expect(repo.create).not.toHaveBeenCalled();
      expect(result.created).toBe(false);
      expect(result.task).toBe(existingTask);
    });

    it('should throw BAD_REQUEST when clientTaskId already exists but with different taskType', async () => {
      const existingTask = createMockTask({ taskType: 'NAVIGATION_ROUTE' });
      repo.findOne.mockResolvedValueOnce(existingTask);

      await expect(
        service.createOrGet(mockUserId, dto),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.BAD_REQUEST,
      });
    });

    it('should handle race condition (Postgres 23505 unique violation) by fetching existing task (created = false)', async () => {
      repo.findOne.mockResolvedValueOnce(null); // Initial check: not found

      const uniqueError: any = new Error(
        'duplicate key value violates unique constraint',
      );
      uniqueError.code = '23505';
      repo.create.mockRejectedValueOnce(uniqueError);

      const existingRacedTask = createMockTask();
      repo.findOne.mockResolvedValueOnce(existingRacedTask); // Second check: returns raced task

      const result = await service.createOrGet(mockUserId, dto);

      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(repo.findOne).toHaveBeenCalledTimes(2);
      expect(result.created).toBe(false);
      expect(result.task).toBe(existingRacedTask);
    });

    it('should throw BAD_REQUEST if raced task has different taskType', async () => {
      repo.findOne.mockResolvedValueOnce(null);

      const uniqueError: any = new Error(
        'duplicate key value violates unique constraint',
      );
      uniqueError.code = '23505';
      repo.create.mockRejectedValueOnce(uniqueError);

      const existingRacedTask = createMockTask({ taskType: 'DIFFERENT_TYPE' });
      repo.findOne.mockResolvedValueOnce(existingRacedTask);

      await expect(
        service.createOrGet(mockUserId, dto),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.BAD_REQUEST,
      });
    });

    it('should rethrow unexpected database errors during creation', async () => {
      repo.findOne.mockResolvedValueOnce(null);
      const dbError = new Error('Connection refused');
      repo.create.mockRejectedValueOnce(dbError);

      await expect(service.createOrGet(mockUserId, dto)).rejects.toThrow(
        'Connection refused',
      );
    });
  });

  describe('getForUser', () => {
    it('should return task when owned by user', async () => {
      const task = createMockTask();
      repo.findOne.mockResolvedValueOnce(task);

      const result = await service.getForUser(mockUserId, mockTaskId);
      expect(result).toBe(task);
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: mockTaskId, userId: mockUserId },
      });
    });

    it('should throw NOT_FOUND when task is not found or belongs to another user without leaking existence', async () => {
      repo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.getForUser('other-user', mockTaskId),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.NOT_FOUND,
      });
    });
  });

  describe('cancel', () => {
    it('should cancel a task in PENDING status', async () => {
      const pendingTask = createMockTask({ status: TaskStatus.PENDING });
      const cancelledTask = createMockTask({ status: TaskStatus.CANCELLED });

      repo.findOne
        .mockResolvedValueOnce(pendingTask) // getForUser
        .mockResolvedValueOnce(cancelledTask); // read updated
      repo.updateMany.mockResolvedValueOnce({ affected: 1 });

      const result = await service.cancel(mockUserId, mockTaskId);

      expect(repo.updateMany).toHaveBeenCalledWith(
        { id: mockTaskId, status: TaskStatus.PENDING },
        expect.objectContaining({
          status: TaskStatus.CANCELLED,
          completedAt: expect.any(Function),
        }),
      );
      // Verify completedAt returns 'now()'
      const updatePayload = repo.updateMany.mock.calls[0][1];
      expect(updatePayload.completedAt()).toBe('now()');
      expect(result.status).toBe(TaskStatus.CANCELLED);
    });

    it('should cancel a task in PROCESSING status', async () => {
      const processingTask = createMockTask({ status: TaskStatus.PROCESSING });
      const cancelledTask = createMockTask({ status: TaskStatus.CANCELLED });

      repo.findOne
        .mockResolvedValueOnce(processingTask) // getForUser
        .mockResolvedValueOnce(cancelledTask); // read updated
      repo.updateMany.mockResolvedValueOnce({ affected: 1 });

      const result = await service.cancel(mockUserId, mockTaskId);

      expect(repo.updateMany).toHaveBeenCalledWith(
        { id: mockTaskId, status: TaskStatus.PROCESSING },
        expect.objectContaining({
          status: TaskStatus.CANCELLED,
          completedAt: expect.any(Function),
        }),
      );
      expect(result.status).toBe(TaskStatus.CANCELLED);
    });

    it('should return already CANCELLED task idempotently without calling updateMany', async () => {
      const alreadyCancelled = createMockTask({ status: TaskStatus.CANCELLED });
      repo.findOne.mockResolvedValueOnce(alreadyCancelled);

      const result = await service.cancel(mockUserId, mockTaskId);

      expect(result).toBe(alreadyCancelled);
      expect(repo.updateMany).not.toHaveBeenCalled();
    });

    it('should throw BAD_REQUEST when cancelling COMPLETED task', async () => {
      const completedTask = createMockTask({ status: TaskStatus.COMPLETED });
      repo.findOne.mockResolvedValueOnce(completedTask);

      await expect(
        service.cancel(mockUserId, mockTaskId),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.BAD_REQUEST,
      });
    });

    it('should throw BAD_REQUEST when cancelling FAILED task', async () => {
      const failedTask = createMockTask({ status: TaskStatus.FAILED });
      repo.findOne.mockResolvedValueOnce(failedTask);

      await expect(
        service.cancel(mockUserId, mockTaskId),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.BAD_REQUEST,
      });
    });
  });

  describe('markProcessing, markCompleted, markFailed and Race Conditions', () => {
    it('markProcessing should transition from PENDING to PROCESSING', async () => {
      const pendingTask = createMockTask({ status: TaskStatus.PENDING });
      const processingTask = createMockTask({ status: TaskStatus.PROCESSING });

      repo.findOne
        .mockResolvedValueOnce(pendingTask)
        .mockResolvedValueOnce(processingTask);
      repo.updateMany.mockResolvedValueOnce({ affected: 1 });

      const result = await service.markProcessing(mockTaskId);

      expect(repo.updateMany).toHaveBeenCalledWith(
        { id: mockTaskId, status: TaskStatus.PENDING },
        { status: TaskStatus.PROCESSING },
      );
      expect(result.status).toBe(TaskStatus.PROCESSING);
    });

    it('markProcessing should return existing task if already PROCESSING', async () => {
      const processingTask = createMockTask({ status: TaskStatus.PROCESSING });
      repo.findOne.mockResolvedValueOnce(processingTask);

      const result = await service.markProcessing(mockTaskId);

      expect(result).toBe(processingTask);
      expect(repo.updateMany).not.toHaveBeenCalled();
    });

    it('markCompleted should set completedAt and processingTimeMs', async () => {
      const processingTask = createMockTask({ status: TaskStatus.PROCESSING });
      const completedTask = createMockTask({
        status: TaskStatus.COMPLETED,
        processingTimeMs: 120,
      });

      repo.findOne
        .mockResolvedValueOnce(processingTask)
        .mockResolvedValueOnce(completedTask);
      repo.updateMany.mockResolvedValueOnce({ affected: 1 });

      const result = await service.markCompleted(mockTaskId, 120);

      expect(repo.updateMany).toHaveBeenCalledWith(
        { id: mockTaskId, status: TaskStatus.PROCESSING },
        expect.objectContaining({
          status: TaskStatus.COMPLETED,
          processingTimeMs: 120,
          completedAt: expect.any(Function),
        }),
      );
      const updatePayload = repo.updateMany.mock.calls[0][1];
      expect(updatePayload.completedAt()).toBe('now()');
      expect(result.status).toBe(TaskStatus.COMPLETED);
    });

    it('markFailed should set completedAt, errorCode and processingTimeMs', async () => {
      const processingTask = createMockTask({ status: TaskStatus.PROCESSING });
      const failedTask = createMockTask({
        status: TaskStatus.FAILED,
        errorCode: 'ERR_TIMEOUT',
        processingTimeMs: 250,
      });

      repo.findOne
        .mockResolvedValueOnce(processingTask)
        .mockResolvedValueOnce(failedTask);
      repo.updateMany.mockResolvedValueOnce({ affected: 1 });

      const result = await service.markFailed(mockTaskId, 'ERR_TIMEOUT', 250);

      expect(repo.updateMany).toHaveBeenCalledWith(
        { id: mockTaskId, status: TaskStatus.PROCESSING },
        expect.objectContaining({
          status: TaskStatus.FAILED,
          errorCode: 'ERR_TIMEOUT',
          processingTimeMs: 250,
          completedAt: expect.any(Function),
        }),
      );
      const updatePayload = repo.updateMany.mock.calls[0][1];
      expect(updatePayload.completedAt()).toBe('now()');
      expect(result.status).toBe(TaskStatus.FAILED);
    });

    it('should reject invalid transition (e.g. markProcessing from COMPLETED)', async () => {
      const completedTask = createMockTask({ status: TaskStatus.COMPLETED });
      repo.findOne.mockResolvedValueOnce(completedTask);

      await expect(
        service.markProcessing(mockTaskId),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.BAD_REQUEST,
      });
    });

    it('should handle transition race condition: affected=0 and latest already at targetStatus', async () => {
      const pendingTask = createMockTask({ status: TaskStatus.PENDING });
      const latestTask = createMockTask({ status: TaskStatus.CANCELLED });

      repo.findOne
        .mockResolvedValueOnce(pendingTask) // initial fetch
        .mockResolvedValueOnce(latestTask); // latest fetch after affected=0
      repo.updateMany.mockResolvedValueOnce({ affected: 0 });

      const result = await service.cancel(mockUserId, mockTaskId);

      expect(result).toBe(latestTask);
    });

    it('should handle transition race condition: affected=0 and latest status cannot transition', async () => {
      const pendingTask = createMockTask({ status: TaskStatus.PENDING });
      const latestTask = createMockTask({ status: TaskStatus.COMPLETED }); // Raced to COMPLETED

      repo.findOne
        .mockResolvedValueOnce(pendingTask) // initial fetch
        .mockResolvedValueOnce(latestTask); // latest fetch after affected=0
      repo.updateMany.mockResolvedValueOnce({ affected: 0 });

      await expect(
        service.cancel(mockUserId, mockTaskId),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.BAD_REQUEST,
      });
    });

    it('should throw NOT_FOUND if task does not exist on transition helper', async () => {
      repo.findOne.mockResolvedValueOnce(null);

      await expect(service.markProcessing('missing-id')).rejects.toThrowError(
        AppException,
      );
    });
  });
});
