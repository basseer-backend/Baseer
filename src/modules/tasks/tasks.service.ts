import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { AppErrorCode } from '../../common/constants/error-codes';
import { AppException } from '../../common/exceptions/app.exception';
import { TaskExecution } from '../../database/entities/task-execution.entity';
import { TaskExecutionRepository } from '../../database/repositories/task-execution.repository';
import { CreateTaskDto } from './dto/create-task.dto';
import {
  canTransition,
  TaskStatus,
  TERMINAL_TASK_STATUSES,
} from './enums/task-status.enum';

@Injectable()
export class TasksService {
  constructor(private readonly taskExecutionRepo: TaskExecutionRepository) {}

  async createOrGet(
    userId: string,
    dto: CreateTaskDto,
  ): Promise<{ task: TaskExecution; created: boolean }> {
    const existing = await this.taskExecutionRepo.findOne({
      where: { userId, clientTaskId: dto.clientTaskId },
    });

    if (existing) {
      if (existing.taskType !== dto.taskType) {
        throw new AppException(
          AppErrorCode.BAD_REQUEST,
          `Task clientTaskId "${dto.clientTaskId}" already exists with taskType "${existing.taskType}", cannot reuse with different taskType "${dto.taskType}".`,
        );
      }
      return { task: existing, created: false };
    }

    const requestId = randomUUID();
    try {
      const newTask = await this.taskExecutionRepo.create({
        userId,
        clientTaskId: dto.clientTaskId,
        taskType: dto.taskType,
        requestId,
        status: TaskStatus.PENDING,
      });
      return { task: newTask, created: true };
    } catch (error: any) {
      const isUniqueViolation =
        error?.code === '23505' ||
        error?.driverError?.code === '23505' ||
        error?.message?.includes('23505') ||
        error?.message?.includes('uq_task_executions_user_client_task');

      if (isUniqueViolation) {
        const raced = await this.taskExecutionRepo.findOne({
          where: { userId, clientTaskId: dto.clientTaskId },
        });
        if (raced) {
          if (raced.taskType !== dto.taskType) {
            throw new AppException(
              AppErrorCode.BAD_REQUEST,
              `Task clientTaskId "${dto.clientTaskId}" already exists with taskType "${raced.taskType}", cannot reuse with different taskType "${dto.taskType}".`,
            );
          }
          return { task: raced, created: false };
        }
      }
      throw error;
    }
  }

  async getForUser(userId: string, id: string): Promise<TaskExecution> {
    const task = await this.taskExecutionRepo.findOne({
      where: { id, userId },
    });

    if (!task) {
      throw new AppException(
        AppErrorCode.NOT_FOUND,
        `Task with ID "${id}" was not found.`,
      );
    }

    return task;
  }

  async cancel(userId: string, id: string): Promise<TaskExecution> {
    const task = await this.getForUser(userId, id);

    if (task.status === TaskStatus.CANCELLED) {
      return task;
    }

    const currentStatus = task.status as TaskStatus;
    if (!canTransition(currentStatus, TaskStatus.CANCELLED)) {
      throw new AppException(
        AppErrorCode.BAD_REQUEST,
        `Cannot cancel task in status "${task.status}".`,
      );
    }

    return this.transitionStatus(id, currentStatus, TaskStatus.CANCELLED);
  }

  async markProcessing(id: string): Promise<TaskExecution> {
    const task = await this.taskExecutionRepo.findOne({ where: { id } });
    if (!task) {
      throw new AppException(
        AppErrorCode.NOT_FOUND,
        `Task with ID "${id}" was not found.`,
      );
    }

    if (task.status === TaskStatus.PROCESSING) {
      return task;
    }

    const currentStatus = task.status as TaskStatus;
    if (!canTransition(currentStatus, TaskStatus.PROCESSING)) {
      throw new AppException(
        AppErrorCode.BAD_REQUEST,
        `Cannot transition task from "${task.status}" to "${TaskStatus.PROCESSING}".`,
      );
    }

    return this.transitionStatus(id, currentStatus, TaskStatus.PROCESSING);
  }

  async markCompleted(
    id: string,
    processingTimeMs?: number,
  ): Promise<TaskExecution> {
    const task = await this.taskExecutionRepo.findOne({ where: { id } });
    if (!task) {
      throw new AppException(
        AppErrorCode.NOT_FOUND,
        `Task with ID "${id}" was not found.`,
      );
    }

    if (task.status === TaskStatus.COMPLETED) {
      return task;
    }

    const currentStatus = task.status as TaskStatus;
    if (!canTransition(currentStatus, TaskStatus.COMPLETED)) {
      throw new AppException(
        AppErrorCode.BAD_REQUEST,
        `Cannot transition task from "${task.status}" to "${TaskStatus.COMPLETED}".`,
      );
    }

    const extraFields: QueryDeepPartialEntity<TaskExecution> = {};
    if (processingTimeMs !== undefined) {
      extraFields.processingTimeMs = processingTimeMs;
    }

    return this.transitionStatus(
      id,
      currentStatus,
      TaskStatus.COMPLETED,
      extraFields,
    );
  }

  async markFailed(
    id: string,
    errorCode?: string,
    processingTimeMs?: number,
  ): Promise<TaskExecution> {
    const task = await this.taskExecutionRepo.findOne({ where: { id } });
    if (!task) {
      throw new AppException(
        AppErrorCode.NOT_FOUND,
        `Task with ID "${id}" was not found.`,
      );
    }

    if (task.status === TaskStatus.FAILED) {
      return task;
    }

    const currentStatus = task.status as TaskStatus;
    if (!canTransition(currentStatus, TaskStatus.FAILED)) {
      throw new AppException(
        AppErrorCode.BAD_REQUEST,
        `Cannot transition task from "${task.status}" to "${TaskStatus.FAILED}".`,
      );
    }

    const extraFields: QueryDeepPartialEntity<TaskExecution> = {};
    if (errorCode !== undefined) {
      extraFields.errorCode = errorCode;
    }
    if (processingTimeMs !== undefined) {
      extraFields.processingTimeMs = processingTimeMs;
    }

    return this.transitionStatus(
      id,
      currentStatus,
      TaskStatus.FAILED,
      extraFields,
    );
  }

  private async transitionStatus(
    id: string,
    expectedStatus: TaskStatus,
    targetStatus: TaskStatus,
    extraFields: QueryDeepPartialEntity<TaskExecution> = {},
  ): Promise<TaskExecution> {
    if (!canTransition(expectedStatus, targetStatus)) {
      throw new AppException(
        AppErrorCode.BAD_REQUEST,
        `Cannot transition task from "${expectedStatus}" to "${targetStatus}".`,
      );
    }

    const isTerminal = TERMINAL_TASK_STATUSES.includes(targetStatus);
    const updateData: QueryDeepPartialEntity<TaskExecution> = {
      status: targetStatus,
      ...(isTerminal ? { completedAt: () => 'now()' as any } : {}),
      ...extraFields,
    };

    const result = await this.taskExecutionRepo.updateMany(
      { id, status: expectedStatus },
      updateData,
    );

    if (result.affected === 0) {
      const latest = await this.taskExecutionRepo.findOne({ where: { id } });
      if (!latest) {
        throw new AppException(
          AppErrorCode.NOT_FOUND,
          `Task with ID "${id}" was not found.`,
        );
      }

      if (latest.status === targetStatus) {
        return latest;
      }

      const latestStatus = latest.status as TaskStatus;
      if (!canTransition(latestStatus, targetStatus)) {
        throw new AppException(
          AppErrorCode.BAD_REQUEST,
          `Cannot transition task from "${latest.status}" to "${targetStatus}".`,
        );
      }

      return this.transitionStatus(id, latestStatus, targetStatus, extraFields);
    }

    const updated = await this.taskExecutionRepo.findOne({ where: { id } });
    if (!updated) {
      throw new AppException(
        AppErrorCode.NOT_FOUND,
        `Task with ID "${id}" was not found.`,
      );
    }
    return updated;
  }
}
