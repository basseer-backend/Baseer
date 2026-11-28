import { TaskStatus } from '../enums/task-status.enum';

/**
 * Authoritative temporary task state stored in Redis.
 *
 * Requirements:
 * 1. Hard TTL of exactly 7200 seconds (2 hours) from creation.
 * 2. Updates (transitions, results) strictly preserve the original expiration timestamp.
 * 3. Result payloads (extracted text, etc.) are ONLY stored here and NEVER in PostgreSQL.
 */
export interface RedisTaskState {
  id: string;
  userId: string;
  clientTaskId: string;
  requestId: string;
  taskType: string;
  status: TaskStatus;
  processingTimeMs: number | null;
  errorCode: string | null;
  result: Record<string, any> | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: number;
}
