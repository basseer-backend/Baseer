import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskExecution } from '../../database/entities/task-execution.entity';
import { TaskStatus } from './enums/task-status.enum';
import { CreateTaskDto } from './dto/create-task.dto';

describe('TasksController', () => {
  let controller: TasksController;
  let service: {
    createOrGet: ReturnType<typeof vi.fn>;
    getForUser: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };

  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockTaskId = '22222222-2222-2222-2222-222222222222';
  const mockClientTaskId = '33333333-3333-3333-3333-333333333333';

  const createMockTask = (
    overrides: Partial<TaskExecution> = {},
  ): TaskExecution => {
    const task = new TaskExecution();
    task.id = mockTaskId;
    task.userId = mockUserId;
    task.clientTaskId = mockClientTaskId;
    task.requestId = '44444444-4444-4444-4444-444444444444';
    task.taskType = 'OCR_DOCUMENT';
    task.status = TaskStatus.PENDING;
    task.processingTimeMs = null;
    task.errorCode = null;
    task.createdAt = new Date('2026-11-22T10:00:00Z');
    task.completedAt = null;
    return Object.assign(task, overrides);
  };

  beforeEach(() => {
    service = {
      createOrGet: vi.fn(),
      getForUser: vi.fn(),
      cancel: vi.fn(),
    };

    controller = new TasksController(service as unknown as TasksService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    const dto: CreateTaskDto = {
      clientTaskId: mockClientTaskId,
      taskType: 'OCR_DOCUMENT',
    };

    it('should return 201 Created when a new task is created', async () => {
      const task = createMockTask();
      service.createOrGet.mockResolvedValueOnce({ task, created: true });

      const mockRes = {
        status: vi.fn().mockReturnThis(),
      } as unknown as Response;

      const result = await controller.create(mockUserId, dto, mockRes);

      expect(service.createOrGet).toHaveBeenCalledWith(mockUserId, dto);
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(result.id).toBe(task.id);
      expect(result.clientTaskId).toBe(task.clientTaskId);
      expect(result.taskType).toBe(task.taskType);
      expect(result.status).toBe(TaskStatus.PENDING);
    });

    it('should return 200 OK when task already exists (duplicate idempotent request)', async () => {
      const task = createMockTask();
      service.createOrGet.mockResolvedValueOnce({ task, created: false });

      const mockRes = {
        status: vi.fn().mockReturnThis(),
      } as unknown as Response;

      const result = await controller.create(mockUserId, dto, mockRes);

      expect(service.createOrGet).toHaveBeenCalledWith(mockUserId, dto);
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(result.id).toBe(task.id);
    });
  });

  describe('findOne', () => {
    it('should return task response for user', async () => {
      const task = createMockTask();
      service.getForUser.mockResolvedValueOnce(task);

      const result = await controller.findOne(mockUserId, mockTaskId);

      expect(service.getForUser).toHaveBeenCalledWith(mockUserId, mockTaskId);
      expect(result.id).toBe(mockTaskId);
      expect(result.status).toBe(TaskStatus.PENDING);
    });
  });

  describe('cancel', () => {
    it('should cancel task and return task response', async () => {
      const task = createMockTask({
        status: TaskStatus.CANCELLED,
        completedAt: new Date('2026-11-22T10:05:00Z'),
      });
      service.cancel.mockResolvedValueOnce(task);

      const result = await controller.cancel(mockUserId, mockTaskId);

      expect(service.cancel).toHaveBeenCalledWith(mockUserId, mockTaskId);
      expect(result.id).toBe(mockTaskId);
      expect(result.status).toBe(TaskStatus.CANCELLED);
      expect(result.completedAt).toEqual(task.completedAt);
    });
  });
});
