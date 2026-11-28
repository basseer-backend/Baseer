import { Injectable, Logger } from '@nestjs/common';
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
import { RedisTaskStoreService } from './services/redis-task-store.service';
import { RedisTaskState } from './interfaces/redis-task-state.interface';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly taskExecutionRepo: TaskExecutionRepository,
    private readonly redisTaskStore: RedisTaskStoreService,
  ) {}

  /**
   * Idempotently creates or retrieves a task.
   * Persists non-text operational metadata in PostgreSQL and initializes authoritative
   * task state in Redis with an exact 7200-second TTL.
   * If Redis initialization fails, rolls back the PostgreSQL record to prevent orphaned state.
   */
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

      // Ensure Redis has authoritative state for polling
      try {
        await this.redisTaskStore.getTask(existing.id, userId);
      } catch (err: any) {
        if (
          err instanceof AppException &&
          err.errorCode === AppErrorCode.NOT_FOUND
        ) {
          // Rehydrate into Redis if missing
          await this.redisTaskStore.createTask({
            id: existing.id,
            userId: existing.userId,
            clientTaskId: existing.clientTaskId,
            requestId: existing.requestId,
            taskType: existing.taskType,
            status: existing.status as TaskStatus,
            processingTimeMs: existing.processingTimeMs,
            errorCode: existing.errorCode,
            result: null,
            createdAt: existing.createdAt.toISOString(),
            completedAt: existing.completedAt
              ? existing.completedAt.toISOString()
              : null,
          });
        }
      }

      return { task: existing, created: false };
    }

    const requestId = randomUUID();
    let newTask: TaskExecution;

    try {
      newTask = await this.taskExecutionRepo.create({
        userId,
        clientTaskId: dto.clientTaskId,
        taskType: dto.taskType,
        requestId,
        status: TaskStatus.PENDING,
      });
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

          try {
            await this.redisTaskStore.getTask(raced.id, userId);
          } catch (rErr: any) {
            if (
              rErr instanceof AppException &&
              rErr.errorCode === AppErrorCode.NOT_FOUND
            ) {
              await this.redisTaskStore.createTask({
                id: raced.id,
                userId: raced.userId,
                clientTaskId: raced.clientTaskId,
                requestId: raced.requestId,
                taskType: raced.taskType,
                status: raced.status as TaskStatus,
                processingTimeMs: raced.processingTimeMs,
                errorCode: raced.errorCode,
                result: null,
                createdAt: raced.createdAt.toISOString(),
                completedAt: raced.completedAt
                  ? raced.completedAt.toISOString()
                  : null,
              });
            }
          }

          return { task: raced, created: false };
        }
      }
      throw error;
    }

    // Initialize authoritative state in Redis with 7200s TTL
    try {
      await this.redisTaskStore.createTask({
        id: newTask.id,
        userId: newTask.userId,
        clientTaskId: newTask.clientTaskId,
        requestId: newTask.requestId,
        taskType: newTask.taskType,
        status: TaskStatus.PENDING,
        processingTimeMs: null,
        errorCode: null,
        result: null,
        createdAt: newTask.createdAt
          ? newTask.createdAt.toISOString()
          : new Date().toISOString(),
        completedAt: null,
      });
    } catch (redisError: any) {
      // Rollback DB record so task is not left half-created (Constraint 7)
      try {
        await this.taskExecutionRepo.deleteMany({ id: newTask.id });
      } catch (dbErr: any) {
        this.logger.error(
          `Failed to rollback PostgreSQL task ${newTask.id} after Redis failure: ${dbErr?.message}`,
        );
      }
      throw redisError;
    }

    return { task: newTask, created: true };
  }

  /**
   * Retrieves task state strictly from Redis.
   * PostgreSQL is NOT used as a fallback for polling (Constraint 1).
   */
  async getForUser(userId: string, id: string): Promise<RedisTaskState> {
    return this.redisTaskStore.getTask(id, userId);
  }

  /**
   * Atomically cancels task execution in Redis.
   * Strictly preserves original TTL and prevents overwriting completed/failed tasks.
   * Synchronizes PostgreSQL operational metadata best-effort.
   */
  async cancel(userId: string, id: string): Promise<RedisTaskState> {
    const cancelledState = await this.redisTaskStore.cancelTask(id, userId);

    // Sync PostgreSQL operational metadata best-effort
    try {
      await this.taskExecutionRepo.updateMany(
        { id, status: TaskStatus.PENDING },
        {
          status: TaskStatus.CANCELLED,
          completedAt: () => 'now()' as any,
        },
      );
      await this.taskExecutionRepo.updateMany(
        { id, status: TaskStatus.PROCESSING },
        {
          status: TaskStatus.CANCELLED,
          completedAt: () => 'now()' as any,
        },
      );
    } catch (err: any) {
      this.logger.warn(
        `Failed to sync CANCELLED status to PostgreSQL for task "${id}": ${err?.message}`,
      );
    }

    return cancelledState;
  }

  /**
   * Transitions task status to PROCESSING in Redis and syncs PostgreSQL.
   */
  async markProcessing(id: string): Promise<RedisTaskState> {
    const updated = await this.redisTaskStore.transitionStatus(
      id,
      TaskStatus.PROCESSING,
    );

    try {
      await this.taskExecutionRepo.updateMany(
        { id, status: TaskStatus.PENDING },
        { status: TaskStatus.PROCESSING },
      );
    } catch (err: any) {
      this.logger.warn(
        `Failed to sync PROCESSING to DB for task "${id}": ${err?.message}`,
      );
    }

    return updated;
  }

  /**
   * Completes task with temporary result text stored strictly in Redis.
   * Text is NEVER written to PostgreSQL.
   */
  async markCompleted(
    id: string,
    resultPayload?: Record<string, any>,
    processingTimeMs?: number,
  ): Promise<RedisTaskState> {
    const updated = await this.redisTaskStore.completeWithResult(
      id,
      resultPayload || {},
      processingTimeMs,
    );

    try {
      const extraFields: QueryDeepPartialEntity<TaskExecution> = {
        status: TaskStatus.COMPLETED,
        completedAt: () => 'now()' as any,
      };
      if (processingTimeMs !== undefined) {
        extraFields.processingTimeMs = processingTimeMs;
      }
      await this.taskExecutionRepo.updateMany(
        { id, status: TaskStatus.PROCESSING },
        extraFields,
      );
      await this.taskExecutionRepo.updateMany(
        { id, status: TaskStatus.PENDING },
        extraFields,
      );
    } catch (err: any) {
      this.logger.warn(
        `Failed to sync COMPLETED to DB for task "${id}": ${err?.message}`,
      );
    }

    return updated;
  }

  /**
   * Marks task as FAILED in Redis and syncs PostgreSQL operational metadata.
   */
  async markFailed(
    id: string,
    errorCode?: string,
    processingTimeMs?: number,
  ): Promise<RedisTaskState> {
    const updates: Partial<RedisTaskState> = {
      errorCode: errorCode || null,
      completedAt: new Date().toISOString(),
    };
    if (processingTimeMs !== undefined) {
      updates.processingTimeMs = processingTimeMs;
    }

    const updated = await this.redisTaskStore.transitionStatus(
      id,
      TaskStatus.FAILED,
      updates,
    );

    try {
      const extraFields: QueryDeepPartialEntity<TaskExecution> = {
        status: TaskStatus.FAILED,
        completedAt: () => 'now()' as any,
      };
      if (errorCode !== undefined) {
        extraFields.errorCode = errorCode;
      }
      if (processingTimeMs !== undefined) {
        extraFields.processingTimeMs = processingTimeMs;
      }
      await this.taskExecutionRepo.updateMany({ id }, extraFields);
    } catch (err: any) {
      this.logger.warn(
        `Failed to sync FAILED to DB for task "${id}": ${err?.message}`,
      );
    }

    return updated;
  }
}
