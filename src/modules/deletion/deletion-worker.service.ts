import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { AuthSessionRepository } from '../../database/repositories/auth-session.repository';
import { DeletionAuditEventRepository } from '../../database/repositories/deletion-audit-event.repository';
import { DeletionRequestRepository } from '../../database/repositories/deletion-request.repository';
import { UserRepository } from '../../database/repositories/user.repository';
import {
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_LEASE_DURATION_SECONDS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_POLL_INTERVAL_MS,
  DeletionStatus,
} from './deletion.constants';
import {
  computeAnonymizedUserHash,
  getHmacKeyVersion,
} from './deletion-crypto.helper';

export interface ClaimedDeletionJob {
  requestId: string;
  userId: string | null;
  attemptCount: number;
  maxAttempts: number;
}

@Injectable()
export class DeletionWorkerService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(DeletionWorkerService.name);
  private readonly workerId = `worker-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  private isProcessing = false;
  private isShuttingDown = false;
  private hasPendingTrigger = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private activeProcessingPromise: Promise<void> | null = null;
  private leaseDurationSeconds = DEFAULT_LEASE_DURATION_SECONDS;
  private pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
  private heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS;

  constructor(
    private readonly dataSource: DataSource,
    private readonly deletionRequestRepo: DeletionRequestRepository,
    private readonly deletionAuditEventRepo: DeletionAuditEventRepository,
    private readonly authSessionRepo: AuthSessionRepository,
    private readonly userRepo: UserRepository,
  ) {}

  onModuleInit(): void {
    this.logger.log(`Starting DeletionWorkerService (${this.workerId})...`);
    this.scheduleNextPoll(1000); // Initial start delay
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(
      `Worker ${this.workerId} received shutdown signal (${signal}). Gracefully stopping...`,
    );
    this.isShuttingDown = true;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // Await active in-flight processing cycle up to safe shutdown timeout
    if (this.activeProcessingPromise) {
      const SHUTDOWN_TIMEOUT_MS = 5000;
      let timer: NodeJS.Timeout | null = null;
      const timeoutPromise = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, SHUTDOWN_TIMEOUT_MS);
      });
      await Promise.race([this.activeProcessingPromise, timeoutPromise]);
      if (timer) clearTimeout(timer);
    }

    this.logger.log(`Worker ${this.workerId} shutdown complete.`);
  }

  /**
   * Immediately wakes up the worker to check for pending jobs.
   * Ensures uninterrupted subsequent polling and prevents duplicate timers.
   */
  trigger(): void {
    if (this.isShuttingDown) return;

    if (this.isProcessing) {
      // Flag pending trigger so next cycle starts immediately upon completion
      this.hasPendingTrigger = true;
      return;
    }

    // Reschedule poll timer to run immediately
    this.scheduleNextPoll(0);
  }

  /**
   * Schedules the next polling tick using setTimeout to avoid overlapping cycles.
   * Always guarantees that the next polling cycle is scheduled.
   */
  private scheduleNextPoll(delayMs = this.pollIntervalMs): void {
    if (this.isShuttingDown) return;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    this.pollTimer = setTimeout(async () => {
      this.pollTimer = null;
      try {
        await this.runProcessingCycle();
      } catch (err: any) {
        this.logger.error(
          `Error in worker poll cycle [category: ${err?.name || 'Error'}]`,
        );
      } finally {
        if (!this.isShuttingDown && !this.pollTimer) {
          const nextDelay = this.hasPendingTrigger ? 0 : this.pollIntervalMs;
          this.hasPendingTrigger = false;
          this.scheduleNextPoll(nextDelay);
        }
      }
    }, delayMs);
  }

  /**
   * Runs a processing cycle, draining all available eligible jobs one by one.
   * Tracks active cycle promise to support graceful shutdown.
   */
  async runProcessingCycle(): Promise<void> {
    if (this.isProcessing || this.isShuttingDown) {
      return;
    }

    this.isProcessing = true;
    const execute = async () => {
      try {
        let hasMore = true;
        while (hasMore && !this.isShuttingDown) {
          hasMore = await this.processNextJob();
        }
      } finally {
        this.isProcessing = false;
        this.activeProcessingPromise = null;
      }
    };

    const cyclePromise = execute();
    this.activeProcessingPromise = cyclePromise;
    await cyclePromise;
  }

  /**
   * Atomically claims and processes the single oldest eligible deletion job.
   * Uses FOR UPDATE SKIP LOCKED to guarantee distributed worker safety.
   * Returns true if a job was claimed and handled, false if queue is empty.
   */
  async processNextJob(overrideWorkerId?: string): Promise<boolean> {
    const workerId = overrideWorkerId || this.workerId;
    const job = await this.claimNextJob(workerId);

    if (!job) {
      return false;
    }

    this.logger.log(
      `Worker ${workerId} claimed deletion request ${job.requestId} (attempt ${job.attemptCount}/${job.maxAttempts})`,
    );

    try {
      await this.executeJob(job, workerId);
      this.logger.log(
        `Successfully completed deletion request ${job.requestId}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Processing error for deletion request ${job.requestId} [category: ${error?.name || 'Error'}]`,
      );
      await this.handleJobFailure(job, error, workerId);
    }

    return true;
  }

  /**
   * Atomically claims the next eligible job via database row lock.
   * Sets lease expiry using PostgreSQL database clock (clock_timestamp).
   */
  async claimNextJob(workerId: string): Promise<ClaimedDeletionJob | null> {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT id, user_id, status, attempt_count, max_attempts
         FROM deletion_requests
         WHERE (status = 'ACCEPTED')
            OR (status = 'PROCESSING' AND (lease_expires_at IS NULL OR lease_expires_at <= clock_timestamp()))
            OR (status = 'FAILED' AND attempt_count < max_attempts AND (next_retry_at IS NULL OR next_retry_at <= clock_timestamp()))
         ORDER BY accepted_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
      );

      if (!rows || rows.length === 0) {
        return null;
      }

      const row = rows[0];
      const requestId = row.id;
      const userId = row.user_id;
      const currentAttempt = (Number(row.attempt_count) || 0) + 1;
      const maxAttempts = Number(row.max_attempts) || DEFAULT_MAX_ATTEMPTS;

      // Transition/Claim to PROCESSING using database clock for timestamps
      await manager.query(
        `UPDATE deletion_requests
         SET status = 'PROCESSING',
             locked_by = $1,
             locked_at = clock_timestamp(),
             lease_expires_at = clock_timestamp() + ($2 || ' seconds')::interval,
             attempt_count = $3,
             stage_status = jsonb_set(COALESCE(stage_status, '{}'::jsonb), '{processing_started_at}', to_jsonb(clock_timestamp()::text))
         WHERE id = $4`,
        [workerId, this.leaseDurationSeconds, currentAttempt, requestId],
      );

      // Record PROCESSING audit event
      const anonymizedUserHash = userId
        ? computeAnonymizedUserHash(userId)
        : '0'.repeat(64);
      const hmacKeyVersion = getHmacKeyVersion();

      await manager.query(
        `INSERT INTO deletion_audit_events (id, deletion_request_id, event_status, anonymized_user_hash, hmac_key_version, occurred_at)
         VALUES (gen_random_uuid(), $1, 'PROCESSING', $2, $3, clock_timestamp())`,
        [requestId, anonymizedUserHash, hmacKeyVersion],
      );

      return {
        requestId,
        userId,
        attemptCount: currentAttempt,
        maxAttempts,
      };
    });
  }

  /**
   * Renews the lease for an in-flight job, validating strict worker ownership and unexpired lease.
   * Returns true if lease was renewed, false if ownership was lost or expired.
   */
  async renewLease(requestId: string, workerId: string): Promise<boolean> {
    const res = await this.dataSource.query(
      `UPDATE deletion_requests
       SET lease_expires_at = clock_timestamp() + ($1 || ' seconds')::interval
       WHERE id = $2
         AND locked_by = $3
         AND status = 'PROCESSING'
         AND lease_expires_at IS NOT NULL
         AND lease_expires_at > clock_timestamp()
       RETURNING id`,
      [this.leaseDurationSeconds, requestId, workerId],
    );
    return Array.isArray(res) && res.length > 0;
  }

  /**
   * Executes the deletion stages for a claimed job:
   * 1. Starts fail-closed heartbeat lease renewal timer.
   * 2. Revoke active auth sessions for the user with lease fencing.
   * 3. Authoritative atomic purge via complete_account_deletion with database-level fencing.
   * 4. Cleans up heartbeat timer unconditionally and verifies persisted COMPLETED state.
   */
  private async executeJob(
    job: ClaimedDeletionJob,
    workerId: string,
  ): Promise<void> {
    let isLostOwnership = false;
    let heartbeatTimer: NodeJS.Timeout | null = null;

    // Start fail-closed heartbeat lease renewal
    heartbeatTimer = setInterval(async () => {
      try {
        const renewed = await this.renewLease(job.requestId, workerId);
        if (!renewed) {
          this.logger.warn(
            `Worker ${workerId} lost lease ownership for request ${job.requestId}. Aborting processing.`,
          );
          isLostOwnership = true;
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
          }
        }
      } catch {
        // Fail-closed: database/network error means lease can no longer be verified
        this.logger.warn(
          `Heartbeat error renewing lease for request ${job.requestId}. Marking lease unverified and aborting processing.`,
        );
        isLostOwnership = true;
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      }
    }, this.heartbeatIntervalMs);

    try {
      // Check lease ownership before proceeding
      if (isLostOwnership) {
        throw new Error(
          `Lease ownership lost or unverified before execution for request ${job.requestId}`,
        );
      }

      // Stage 1: Revoke all active user sessions
      if (job.userId) {
        await this.authSessionRepo.revokeAllUserSessions(job.userId);
        const stageUpdated = await this.updateStageStatus(
          job.requestId,
          'revoke_sessions',
          'COMPLETED',
          workerId,
        );
        if (!stageUpdated) {
          throw new Error(
            `Lease ownership lost during stage update for request ${job.requestId}`,
          );
        }
      }

      if (isLostOwnership) {
        throw new Error(
          `Lease ownership lost or unverified before final purge for request ${job.requestId}`,
        );
      }

      // Stage 2: Authoritative final purge via database function with worker fencing
      const anonymizedUserHash = job.userId
        ? computeAnonymizedUserHash(job.userId)
        : '0'.repeat(64);
      const hmacKeyVersion = getHmacKeyVersion();

      // Call database function complete_account_deletion (guaranteed single authoritative path)
      await this.dataSource.query(
        `SELECT complete_account_deletion($1::uuid, $2::char(64), $3::smallint, $4::varchar(64))`,
        [job.requestId, anonymizedUserHash, hmacKeyVersion, workerId],
      );

      // Verify persisted state to ensure database function actually committed COMPLETED status
      const checkRows = await this.dataSource.query(
        `SELECT status FROM deletion_requests WHERE id = $1`,
        [job.requestId],
      );

      if (
        !checkRows ||
        checkRows.length === 0 ||
        checkRows[0].status !== DeletionStatus.COMPLETED
      ) {
        throw new Error(
          `Deletion request ${job.requestId} was not marked COMPLETED by authoritative stored function`,
        );
      }
    } finally {
      // Stop heartbeat timer unconditionally
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    }
  }

  /**
   * Handles failure during job execution:
   * Atomically executes the status update and FAILED audit event insertion in a single transaction.
   * If caller still owns valid lease: transitions to FAILED and records audit event.
   * If caller lost ownership: does NOT modify request and does NOT append misleading audit events.
   * If either operation fails: rolls back both operations.
   */
  private async handleJobFailure(
    job: ClaimedDeletionJob,
    error: any,
    workerId: string,
  ): Promise<void> {
    const isExhausted = job.attemptCount >= job.maxAttempts;
    const failureCode = isExhausted
      ? 'ERR_MAX_ATTEMPTS_EXCEEDED'
      : 'ERR_TRANSIENT_PROCESSING_FAILURE';

    const nextRetryAt = isExhausted
      ? null
      : new Date(Date.now() + Math.pow(2, job.attemptCount) * 10 * 1000);

    const anonymizedUserHash = job.userId
      ? computeAnonymizedUserHash(job.userId)
      : '0'.repeat(64);
    const hmacKeyVersion = getHmacKeyVersion();

    // Perform conditional update and audit insertion atomically inside a single transaction
    const updateResult = await this.dataSource.transaction(async (manager) => {
      // 1. Conditionally update status to FAILED only if caller owns valid active lease
      const updatedRows = await manager.query(
        `UPDATE deletion_requests
         SET status = 'FAILED',
             failure_code = $1,
             locked_by = NULL,
             locked_at = NULL,
             lease_expires_at = NULL,
             next_retry_at = $2,
             stage_status = jsonb_set(COALESCE(stage_status, '{}'::jsonb), '{processing}', '"FAILED"'::jsonb)
         WHERE id = $3
           AND locked_by = $4
           AND status = 'PROCESSING'
           AND lease_expires_at IS NOT NULL
           AND lease_expires_at > clock_timestamp()
         RETURNING id`,
        [
          failureCode,
          nextRetryAt ? nextRetryAt.toISOString() : null,
          job.requestId,
          workerId,
        ],
      );

      const hasUpdated = Array.isArray(updatedRows) && updatedRows.length > 0;
      if (!hasUpdated) {
        // Ownership lost or expired: do not update request and do not insert FAILED audit event
        return false;
      }

      // 2. Insert FAILED audit event within the same transaction
      await manager.query(
        `INSERT INTO deletion_audit_events (id, deletion_request_id, event_status, anonymized_user_hash, hmac_key_version, occurred_at)
         VALUES (gen_random_uuid(), $1, 'FAILED', $2, $3, clock_timestamp())`,
        [job.requestId, anonymizedUserHash, hmacKeyVersion],
      );

      return true;
    });

    if (!updateResult) {
      this.logger.warn(
        `Worker ${workerId} did not mark request ${job.requestId} as FAILED: lease ownership was lost or expired.`,
      );
      return;
    }

    this.logger.warn(
      `Deletion request ${job.requestId} marked as FAILED (${failureCode}). Next retry: ${
        nextRetryAt ? nextRetryAt.toISOString() : 'None (Terminal)'
      }`,
    );
  }

  /**
   * Updates stage status conditionally, strictly guaranteeing that only the active lease holder can write.
   */
  private async updateStageStatus(
    requestId: string,
    stage: string,
    status: string,
    workerId: string,
  ): Promise<boolean> {
    try {
      const res = await this.dataSource.query(
        `UPDATE deletion_requests
         SET stage_status = jsonb_set(COALESCE(stage_status, '{}'::jsonb), $1::text[], to_jsonb($2::text))
         WHERE id = $3
           AND locked_by = $4
           AND status = 'PROCESSING'
           AND lease_expires_at IS NOT NULL
           AND lease_expires_at > clock_timestamp()
         RETURNING id`,
        [`{${stage}}`, status, requestId, workerId],
      );
      return Array.isArray(res) && res.length > 0;
    } catch {
      this.logger.warn(
        `Could not update stageStatus for request ${requestId}`,
      );
      return false;
    }
  }
}
