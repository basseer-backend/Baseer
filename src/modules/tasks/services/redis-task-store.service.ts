import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppErrorCode } from '../../../common/constants/error-codes';
import { AppException } from '../../../common/exceptions/app.exception';
import {
  DEFAULT_TASK_KEY_PREFIX,
  DEFAULT_TASK_TTL_SECONDS,
} from '../../../common/redis/redis.constants';
import { RedisService } from '../../../common/redis/redis.service';
import { TaskStatus } from '../enums/task-status.enum';
import { RedisTaskState } from '../interfaces/redis-task-state.interface';

const ATOMIC_TRANSITION_LUA = `
local key = KEYS[1]
local expectedUserId = ARGV[1]
local targetStatus = ARGV[2]
local updatesJson = ARGV[3]

local currentData = redis.call('GET', key)
if not currentData then
  return cjson.encode({ ok = false, code = 'NOT_FOUND', message = 'Task not found or expired' })
end

local task = cjson.decode(currentData)

if expectedUserId ~= '' and task.userId ~= expectedUserId then
  return cjson.encode({ ok = false, code = 'NOT_FOUND', message = 'Task not found or expired' })
end

local currentStatus = task.status

-- If already in target status, return current task state idempotently
if currentStatus == targetStatus then
  return cjson.encode({ ok = true, task = task, changed = false })
end

-- Once CANCELLED is committed in Redis, subsequent processing updates must NOT overwrite it
if currentStatus == 'CANCELLED' then
  return cjson.encode({ ok = false, code = 'ALREADY_CANCELLED', task = task, message = 'Task is already cancelled' })
end

-- Cannot cancel an already completed or failed task
if targetStatus == 'CANCELLED' and (currentStatus == 'COMPLETED' or currentStatus == 'FAILED') then
  return cjson.encode({ ok = false, code = 'INVALID_TRANSITION', task = task, message = 'Cannot cancel task in status ' .. currentStatus })
end

-- Validate allowed transitions:
-- PENDING -> PROCESSING, COMPLETED, FAILED, CANCELLED
-- PROCESSING -> COMPLETED, FAILED, CANCELLED
local allowed = false
if currentStatus == 'PENDING' then
  allowed = (targetStatus == 'PROCESSING' or targetStatus == 'COMPLETED' or targetStatus == 'FAILED' or targetStatus == 'CANCELLED')
elseif currentStatus == 'PROCESSING' then
  allowed = (targetStatus == 'COMPLETED' or targetStatus == 'FAILED' or targetStatus == 'CANCELLED')
end

if not allowed then
  return cjson.encode({ ok = false, code = 'INVALID_TRANSITION', task = task, message = 'Cannot transition task from ' .. currentStatus .. ' to ' .. targetStatus })
end

task.status = targetStatus

if updatesJson and updatesJson ~= '' then
  local updates = cjson.decode(updatesJson)
  for k, v in pairs(updates) do
    task[k] = v
  end
end

local updatedData = cjson.encode(task)
redis.call('SET', key, updatedData, 'KEEPTTL')

return cjson.encode({ ok = true, task = task, changed = true })
`;

@Injectable()
export class RedisTaskStoreService {
  private readonly logger = new Logger(RedisTaskStoreService.name);
  private readonly keyPrefix: string;
  private readonly defaultTtlSeconds: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.keyPrefix =
      this.configService.get<string>('REDIS_KEY_PREFIX') ||
      DEFAULT_TASK_KEY_PREFIX;
    this.defaultTtlSeconds =
      parseInt(
        this.configService.get<string>('REDIS_TASK_TTL_SECONDS') || '',
        10,
      ) || DEFAULT_TASK_TTL_SECONDS;
  }

  private buildKey(id: string): string {
    return `${this.keyPrefix}${id}`;
  }

  /**
   * Initializes or re-initializes task state in Redis with the exact 7200-second TTL.
   */
  async createTask(
    task: Omit<RedisTaskState, 'expiresAt'>,
    ttlSeconds: number = this.defaultTtlSeconds,
  ): Promise<RedisTaskState> {
    const key = this.buildKey(task.id);
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const fullTask: RedisTaskState = {
      ...task,
      expiresAt,
    };

    await this.redisService.setWithTtl(
      key,
      JSON.stringify(fullTask),
      ttlSeconds,
    );

    return fullTask;
  }

  /**
   * Retrieves task state from Redis.
   * Enforces user isolation: throws NOT_FOUND if the task does not belong to expectedUserId.
   * Never falls back to PostgreSQL.
   */
  async getTask(id: string, expectedUserId?: string): Promise<RedisTaskState> {
    const key = this.buildKey(id);
    const raw = await this.redisService.get(key);

    if (!raw) {
      throw new AppException(
        AppErrorCode.NOT_FOUND,
        `Task with ID "${id}" was not found or has expired.`,
      );
    }

    let task: RedisTaskState;
    try {
      task = JSON.parse(raw);
    } catch {
      throw new AppException(
        AppErrorCode.INTERNAL_SERVER_ERROR,
        `Corrupted task state in Redis for ID "${id}".`,
      );
    }

    if (expectedUserId && task.userId !== expectedUserId) {
      // Do not expose other user's tasks or leak task existence across tenants
      throw new AppException(
        AppErrorCode.NOT_FOUND,
        `Task with ID "${id}" was not found or has expired.`,
      );
    }

    return task;
  }

  /**
   * Cancels a task execution atomically in Redis.
   * Strictly preserves original TTL.
   * Prevents overwriting already COMPLETED or FAILED tasks.
   */
  async cancelTask(
    id: string,
    expectedUserId: string,
  ): Promise<RedisTaskState> {
    const key = this.buildKey(id);
    const nowIso = new Date().toISOString();
    const updatesJson = JSON.stringify({ completedAt: nowIso });

    const rawResponse = await this.redisService.evalScript<string>(
      ATOMIC_TRANSITION_LUA,
      [key],
      [expectedUserId, TaskStatus.CANCELLED, updatesJson],
    );

    const result = JSON.parse(rawResponse);

    if (!result.ok) {
      if (result.code === 'NOT_FOUND') {
        throw new AppException(
          AppErrorCode.NOT_FOUND,
          `Task with ID "${id}" was not found or has expired.`,
        );
      }
      if (result.code === 'INVALID_TRANSITION') {
        throw new AppException(
          AppErrorCode.BAD_REQUEST,
          `Cannot cancel task in status "${result.task?.status}".`,
        );
      }
      throw new AppException(
        AppErrorCode.BAD_REQUEST,
        result.message || `Failed to cancel task "${id}".`,
      );
    }

    return result.task as RedisTaskState;
  }

  /**
   * Transitions task status in Redis atomically while preserving TTL.
   */
  async transitionStatus(
    id: string,
    targetStatus: TaskStatus,
    updates: Partial<RedisTaskState> = {},
    expectedUserId: string = '',
  ): Promise<RedisTaskState> {
    const key = this.buildKey(id);
    const updatesJson = JSON.stringify(updates);

    const rawResponse = await this.redisService.evalScript<string>(
      ATOMIC_TRANSITION_LUA,
      [key],
      [expectedUserId, targetStatus, updatesJson],
    );

    const result = JSON.parse(rawResponse);

    if (!result.ok) {
      if (result.code === 'NOT_FOUND') {
        throw new AppException(
          AppErrorCode.NOT_FOUND,
          `Task with ID "${id}" was not found or has expired.`,
        );
      }
      if (result.code === 'ALREADY_CANCELLED') {
        // Once CANCELLED, reject subsequent processing or completion transitions
        throw new AppException(
          AppErrorCode.BAD_REQUEST,
          `Cannot update task: task is already ${TaskStatus.CANCELLED}.`,
        );
      }
      throw new AppException(
        AppErrorCode.BAD_REQUEST,
        result.message || `Cannot transition task to "${targetStatus}".`,
      );
    }

    return result.task as RedisTaskState;
  }

  /**
   * Stores temporary result text/payload in Redis when task is completed.
   * Strictly preserves TTL and sets status to COMPLETED.
   * Result text is NEVER written to PostgreSQL.
   */
  async completeWithResult(
    id: string,
    resultPayload: Record<string, any>,
    processingTimeMs?: number,
  ): Promise<RedisTaskState> {
    const nowIso = new Date().toISOString();
    const updates: Partial<RedisTaskState> = {
      result: resultPayload,
      completedAt: nowIso,
      ...(processingTimeMs !== undefined ? { processingTimeMs } : {}),
    };

    return this.transitionStatus(id, TaskStatus.COMPLETED, updates);
  }

  /**
   * Retrieves remaining TTL in seconds.
   */
  async getTtl(id: string): Promise<number> {
    const key = this.buildKey(id);
    return this.redisService.ttl(key);
  }

  /**
   * Deletes task from Redis.
   */
  async deleteTask(id: string): Promise<void> {
    const key = this.buildKey(id);
    await this.redisService.del(key);
  }
}
