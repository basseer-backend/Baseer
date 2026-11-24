import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppErrorCode } from '../../common/constants/error-codes';
import { AppException } from '../../common/exceptions/app.exception';
import { DeletionAuditEvent } from '../../database/entities/deletion-audit-event.entity';
import { DeletionRequest } from '../../database/entities/deletion-request.entity';
import { DeletionAuditEventRepository } from '../../database/repositories/deletion-audit-event.repository';
import { DeletionRequestRepository } from '../../database/repositories/deletion-request.repository';
import {
  DELETION_METHOD_ONLINE,
  DEFAULT_MAX_ATTEMPTS,
  DeletionStatus,
  MAX_IDEMPOTENCY_KEY_LENGTH,
} from './deletion.constants';
import {
  computeAnonymizedUserHash,
  computeIdempotencyKeyHash,
  generateCapability,
  getHmacKeyVersion,
  verifyCapability,
} from './deletion-crypto.helper';
import { DeletionWorkerService } from './deletion-worker.service';
import { DeletionRequestResponseDto } from './dto/deletion-request-response.dto';
import { DeletionStatusResponseDto } from './dto/deletion-status-response.dto';

export interface DeletionIntakeResult {
  isNew: boolean;
  data: DeletionRequestResponseDto;
}

export const ALLOWED_STAGE_KEYS = [
  'revoke_sessions',
  'processing',
  'processing_started_at',
] as const;

export const ALLOWED_STAGE_STATUSES = new Set([
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
]);

/**
 * Strictly sanitizes stage status objects for public capability-authenticated status checks.
 * Applies an allowlist of permitted stage keys and enforces primitive status or ISO date strings.
 * Never exposes nested objects, user identifiers, SQL statements, stack traces, or errors.
 */
export function sanitizeStageStatus(
  rawStageStatus: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (
    !rawStageStatus ||
    typeof rawStageStatus !== 'object' ||
    Array.isArray(rawStageStatus)
  ) {
    return {};
  }

  const safeStages: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rawStageStatus)) {
    // 1. Strict allowlist of known stage keys only
    if (!ALLOWED_STAGE_KEYS.includes(key as any)) {
      continue;
    }

    // 2. Reject non-primitive values (no nested objects, arrays, etc.)
    if (typeof value !== 'string') {
      continue;
    }

    const trimmed = value.trim();

    // 3. For processing_started_at, validate it is a valid date/timestamp string
    if (key === 'processing_started_at') {
      const parsedTime = Date.parse(trimmed);
      if (
        !isNaN(parsedTime) &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed)
      ) {
        safeStages[key] = trimmed;
      }
      continue;
    }

    // 4. For stage status keys, validate against approved safe status values
    const upper = trimmed.toUpperCase();
    if (ALLOWED_STAGE_STATUSES.has(upper)) {
      safeStages[key] = upper;
    }
  }

  return safeStages;
}

@Injectable()
export class DeletionService {
  private readonly logger = new Logger(DeletionService.name);

  constructor(
    private readonly deletionRequestRepo: DeletionRequestRepository,
    private readonly deletionAuditEventRepo: DeletionAuditEventRepository,
    private readonly deletionWorkerService: DeletionWorkerService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Validates the client-supplied Idempotency-Key header.
   * Enforces presence, non-empty content, maximum length (255), and printable ASCII characters.
   */
  validateIdempotencyKey(rawKey: string | undefined): string {
    if (!rawKey || typeof rawKey !== 'string') {
      throw new AppException(
        AppErrorCode.BAD_REQUEST,
        undefined,
        ['Missing or empty Idempotency-Key header'],
      );
    }

    const trimmed = rawKey.trim();
    if (trimmed.length === 0) {
      throw new AppException(
        AppErrorCode.BAD_REQUEST,
        undefined,
        ['Missing or empty Idempotency-Key header'],
      );
    }

    if (trimmed.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      throw new AppException(
        AppErrorCode.BAD_REQUEST,
        undefined,
        [
          `Idempotency-Key header exceeds maximum length of ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
        ],
      );
    }

    // Reject control characters or newlines (ASCII 0-31 and 127)
    for (let i = 0; i < trimmed.length; i++) {
      const code = trimmed.charCodeAt(i);
      if ((code >= 0 && code <= 31) || code === 127) {
        throw new AppException(
          AppErrorCode.BAD_REQUEST,
          undefined,
          ['Idempotency-Key header contains invalid characters'],
        );
      }
    }

    return trimmed;
  }

  /**
   * Intakes an authenticated account deletion request idempotently.
   * Atomically locks the user record, verifies user existence, checks for active requests,
   * creates an ACCEPTED deletion request and audit event, and wakes up the background worker.
   */
  async createRequest(
    userId: string,
    rawIdempotencyKey: string | undefined,
  ): Promise<DeletionIntakeResult> {
    // 1. Validate Idempotency-Key
    const idempotencyKey = this.validateIdempotencyKey(rawIdempotencyKey);
    const idempotencyKeyHash = computeIdempotencyKeyHash(
      userId,
      idempotencyKey,
    );

    // 2. Fast-path check: exact idempotency replay for already existing requests
    const existingFast = await this.deletionRequestRepo.findOne({
      where: { idempotencyKeyHash },
    });

    if (existingFast) {
      if (existingFast.userId && existingFast.userId !== userId) {
        throw new AppException(
          AppErrorCode.BAD_REQUEST,
          undefined,
          ['Idempotency key belongs to another user'],
        );
      }

      this.logger.log(
        `Idempotent deletion request replay for request ${existingFast.id}`,
      );

      return {
        isNew: false,
        data: {
          id: existingFast.id,
          status: existingFast.status,
          capability: null, // Capability secret is NEVER re-issued
          acceptedAt: existingFast.acceptedAt,
        },
      };
    }

    // 3. Generate one-time raw capability secret and cryptographic hashes
    const { rawCapability, capabilityHash } = generateCapability();
    const anonymizedUserHash = computeAnonymizedUserHash(userId);
    const hmacKeyVersion = getHmacKeyVersion();

    // 4. Atomic transaction with row lock on authenticated user
    let intakeResult: DeletionIntakeResult;

    try {
      intakeResult = await this.dataSource.transaction<DeletionIntakeResult>(
        async (manager) => {
          // a. Row-lock authenticated user in `users` table to serialize concurrent requests for this user
          const userRows = await manager.query(
            `SELECT id FROM users WHERE id = $1 FOR UPDATE`,
            [userId],
          );

          if (!userRows || userRows.length === 0) {
            throw new AppException(
              AppErrorCode.NOT_FOUND,
              undefined,
              ['User account not found'],
            );
          }

          // b. Within lock, re-check exact idempotency key replay in case of race
          const existingInTx = await manager.findOne(DeletionRequest, {
            where: { idempotencyKeyHash },
          });

          if (existingInTx) {
            return {
              isNew: false,
              data: {
                id: existingInTx.id,
                status: existingInTx.status,
                capability: null,
                acceptedAt: existingInTx.acceptedAt,
              },
            };
          }

          // c. Check for active deletion request while holding row lock
          // Active = ACCEPTED, PROCESSING, or FAILED with remaining retry attempts
          const activeRows = await manager.query(
            `SELECT id, status, attempt_count, max_attempts
             FROM deletion_requests
             WHERE user_id = $1
               AND (
                 status IN ('ACCEPTED', 'PROCESSING')
                 OR (status = 'FAILED' AND attempt_count < max_attempts)
               )
             LIMIT 1`,
            [userId],
          );

          if (activeRows && activeRows.length > 0) {
            throw new AppException(
              AppErrorCode.BAD_REQUEST,
              undefined,
              ['An active deletion request already exists for this account'],
            );
          }

          // d. Create DeletionRequest
          const req = manager.create(DeletionRequest, {
            userId,
            status: DeletionStatus.ACCEPTED,
            deletionMethod: DELETION_METHOD_ONLINE,
            idempotencyKeyHash,
            capabilityHash,
            stageStatus: {},
            attemptCount: 0,
            maxAttempts: DEFAULT_MAX_ATTEMPTS,
          });

          const savedReq = await manager.save(DeletionRequest, req);

          // e. Create DeletionAuditEvent atomically within the same transaction
          const auditEvent = manager.create(DeletionAuditEvent, {
            deletionRequestId: savedReq.id,
            eventStatus: DeletionStatus.ACCEPTED,
            anonymizedUserHash,
            hmacKeyVersion,
          });

          await manager.save(DeletionAuditEvent, auditEvent);

          return {
            isNew: true,
            data: {
              id: savedReq.id,
              status: savedReq.status,
              capability: rawCapability,
              acceptedAt: savedReq.acceptedAt,
            },
          };
        },
      );
    } catch (error: any) {
      if (error instanceof AppException) {
        throw error;
      }

      // Handle race condition on unique idempotency constraint
      if (
        error?.code === '23505' ||
        error?.message?.includes('uq_deletion_requests_idempotency_key_hash')
      ) {
        const raceExisting = await this.deletionRequestRepo.findOne({
          where: { idempotencyKeyHash },
        });
        if (raceExisting) {
          return {
            isNew: false,
            data: {
              id: raceExisting.id,
              status: raceExisting.status,
              capability: null,
              acceptedAt: raceExisting.acceptedAt,
            },
          };
        }
      }

      this.logger.error(
        'Failed to create deletion request: internal database processing error',
      );
      throw error;
    }

    if (intakeResult.isNew) {
      this.logger.log(`Accepted deletion request ${intakeResult.data.id}`);
      // Asynchronously notify worker to process immediately (0-second grace period)
      this.deletionWorkerService.trigger();
    } else {
      this.logger.log(
        `Idempotent deletion request replay for request ${intakeResult.data.id}`,
      );
    }

    return intakeResult;
  }

  /**
   * Status check endpoint logic.
   * Validates capability secret in constant time.
   * Does NOT require user existence or authentication.
   */
  async getStatus(
    id: string,
    rawCapability: string | undefined,
  ): Promise<DeletionStatusResponseDto> {
    if (!rawCapability || !rawCapability.trim()) {
      throw new AppException(
        AppErrorCode.BAD_REQUEST,
        undefined,
        ['Missing X-Deletion-Capability header'],
      );
    }

    const request = await this.deletionRequestRepo.findById(id);
    if (!request) {
      // Return 404 to avoid leaking existence of deletion request IDs
      throw new AppException(AppErrorCode.NOT_FOUND);
    }

    const isValid = verifyCapability(rawCapability, request.capabilityHash);
    if (!isValid) {
      // Return 404 to prevent capability enumeration
      throw new AppException(AppErrorCode.NOT_FOUND);
    }

    return {
      id: request.id,
      status: request.status,
      stageStatus: sanitizeStageStatus(request.stageStatus),
      acceptedAt: request.acceptedAt,
      completedAt: request.completedAt,
      failureCode: request.failureCode,
    };
  }
}
