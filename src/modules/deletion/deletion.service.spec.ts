import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AppErrorCode } from '../../common/constants/error-codes';
import { DeletionRequest } from '../../database/entities/deletion-request.entity';
import {
  DeletionStatus,
  MAX_IDEMPOTENCY_KEY_LENGTH,
} from './deletion.constants';
import {
  computeAnonymizedUserHash,
  computeIdempotencyKeyHash,
  generateCapability,
  getHmacKeyVersion,
  getHmacSecret,
} from './deletion-crypto.helper';
import {
  DeletionService,
  sanitizeStageStatus,
} from './deletion.service';

describe('DeletionService', () => {
  let service: DeletionService;
  let mockRequestRepo: {
    findOne: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let mockAuditEventRepo: {
    create: ReturnType<typeof vi.fn>;
  };
  let mockWorkerService: {
    trigger: ReturnType<typeof vi.fn>;
  };
  let mockDataSource: {
    transaction: ReturnType<typeof vi.fn>;
  };
  let mockManager: {
    query: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };

  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockRequestId = '22222222-2222-2222-2222-222222222222';
  const mockIdempotencyKey = 'client-idemp-key-12345';

  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.DELETION_HMAC_SECRET =
      'valid-test-dedicated-hmac-secret-32-chars';
    delete process.env.DELETION_HMAC_KEY_VERSION;

    mockRequestRepo = {
      findOne: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
    };
    mockAuditEventRepo = {
      create: vi.fn(),
    };
    mockWorkerService = {
      trigger: vi.fn(),
    };
    mockDataSource = {
      transaction: vi.fn(),
    };

    mockManager = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('FROM users')) {
          return [{ id: mockUserId }];
        }
        if (sql.includes('FROM deletion_requests')) {
          return [];
        }
        return [];
      }),
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((_entity, data) => data),
      save: vi.fn().mockImplementation(async (_entity, data) => ({
        id: mockRequestId,
        acceptedAt: new Date('2026-11-22T20:00:00Z'),
        ...data,
      })),
    };

    mockDataSource.transaction.mockImplementation(async (callback) =>
      callback(mockManager),
    );

    service = new DeletionService(
      mockRequestRepo as any,
      mockAuditEventRepo as any,
      mockWorkerService as any,
      mockDataSource as any,
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('ISSUE 1 — HMAC Secret & Version Management', () => {
    it('uses dedicated DELETION_HMAC_SECRET when configured', () => {
      process.env.DELETION_HMAC_SECRET = 'dedicated-secret-key-32-chars-long';
      delete process.env.JWT_SECRET;

      const secret = getHmacSecret();
      expect(secret).toBe('dedicated-secret-key-32-chars-long');

      const hash = computeAnonymizedUserHash(mockUserId);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('does not fall back to JWT_SECRET and throws error when DELETION_HMAC_SECRET is missing', () => {
      delete process.env.DELETION_HMAC_SECRET;
      process.env.JWT_SECRET = 'fallback-jwt-secret-key-32-characters';

      expect(() => getHmacSecret()).toThrow(
        /HMAC secret is not configured\. Set DELETION_HMAC_SECRET\./,
      );
      expect(() => computeAnonymizedUserHash(mockUserId)).toThrow(
        /HMAC secret is not configured\. Set DELETION_HMAC_SECRET\./,
      );
    });

    it('throws error when no HMAC secret is configured', () => {
      delete process.env.DELETION_HMAC_SECRET;

      expect(() => getHmacSecret()).toThrow(
        /HMAC secret is not configured\. Set DELETION_HMAC_SECRET\./,
      );
      expect(() => computeAnonymizedUserHash(mockUserId)).toThrow(
        /HMAC secret is not configured\. Set DELETION_HMAC_SECRET\./,
      );
    });

    it('throws error when secret is invalid or too short (< 16 characters)', () => {
      process.env.DELETION_HMAC_SECRET = 'short-key';
      delete process.env.JWT_SECRET;

      expect(() => getHmacSecret()).toThrow(/at least 16 characters/);
      expect(() => computeAnonymizedUserHash(mockUserId)).toThrow(
        /at least 16 characters/,
      );
    });

    it('validates and returns valid key version or defaults to 1', () => {
      delete process.env.DELETION_HMAC_KEY_VERSION;
      expect(getHmacKeyVersion()).toBe(1);

      process.env.DELETION_HMAC_KEY_VERSION = '2';
      expect(getHmacKeyVersion()).toBe(2);

      process.env.DELETION_HMAC_KEY_VERSION = '32767';
      expect(getHmacKeyVersion()).toBe(32767);
    });

    it('rejects malformed or out-of-range key versions', () => {
      const invalidVersions = ['0', '-1', '32768', '1abc', '1.5', 'xyz'];
      for (const val of invalidVersions) {
        process.env.DELETION_HMAC_KEY_VERSION = val;
        expect(() => getHmacKeyVersion()).toThrow();
      }
    });

    it('never exposes secret in errors or hash outputs', () => {
      const secret = 'super-secret-password-key-32-chars';
      process.env.DELETION_HMAC_SECRET = secret;

      const hash = computeAnonymizedUserHash(mockUserId);
      expect(hash).not.toContain(secret);

      process.env.DELETION_HMAC_SECRET = 'short';
      try {
        getHmacSecret();
      } catch (err: any) {
        expect(err.message).not.toContain('short');
      }
    });
  });

  describe('ISSUE 2 — Concurrency Serialization & Active Deletion Checks', () => {
    it('successfully accepts new request and serializes user with SELECT FOR UPDATE', async () => {
      mockRequestRepo.findOne.mockResolvedValue(null);

      const result = await service.createRequest(
        mockUserId,
        mockIdempotencyKey,
      );

      expect(result.isNew).toBe(true);
      expect(result.data.id).toBe(mockRequestId);
      expect(result.data.status).toBe(DeletionStatus.ACCEPTED);
      expect(result.data.capability?.length).toBe(64);

      // Verify row lock was requested on users table
      expect(mockManager.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id FROM users WHERE id = $1 FOR UPDATE'),
        [mockUserId],
      );

      expect(mockWorkerService.trigger).toHaveBeenCalledTimes(1);
    });

    it('safely replays an existing request without re-issuing capability secret', async () => {
      const idempotencyKeyHash = computeIdempotencyKeyHash(
        mockUserId,
        mockIdempotencyKey,
      );
      const existingRequest: Partial<DeletionRequest> = {
        id: mockRequestId,
        userId: mockUserId,
        status: DeletionStatus.ACCEPTED,
        idempotencyKeyHash,
        acceptedAt: new Date('2026-11-22T20:00:00Z'),
      };

      mockRequestRepo.findOne.mockResolvedValueOnce(existingRequest);

      const result = await service.createRequest(
        mockUserId,
        mockIdempotencyKey,
      );

      expect(result.isNew).toBe(false);
      expect(result.data.id).toBe(mockRequestId);
      expect(result.data.capability).toBeNull();
      expect(mockWorkerService.trigger).not.toHaveBeenCalled();
    });

    it('blocks concurrent request when user has existing ACCEPTED request', async () => {
      mockRequestRepo.findOne.mockResolvedValue(null);
      mockManager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM users')) return [{ id: mockUserId }];
        if (sql.includes('FROM deletion_requests')) {
          return [{ id: 'active-1', status: 'ACCEPTED', attempt_count: 0, max_attempts: 3 }];
        }
        return [];
      });

      await expect(
        service.createRequest(mockUserId, 'another-idemp-key'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.BAD_REQUEST,
      });
    });

    it('blocks concurrent request when user has existing PROCESSING request', async () => {
      mockRequestRepo.findOne.mockResolvedValue(null);
      mockManager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM users')) return [{ id: mockUserId }];
        if (sql.includes('FROM deletion_requests')) {
          return [{ id: 'active-1', status: 'PROCESSING', attempt_count: 1, max_attempts: 3 }];
        }
        return [];
      });

      await expect(
        service.createRequest(mockUserId, 'another-idemp-key'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.BAD_REQUEST,
      });
    });

    it('blocks new request when user has a FAILED request with remaining retries', async () => {
      mockRequestRepo.findOne.mockResolvedValue(null);
      mockManager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM users')) return [{ id: mockUserId }];
        if (sql.includes('FROM deletion_requests')) {
          return [{ id: 'retryable-failed', status: 'FAILED', attempt_count: 1, max_attempts: 3 }];
        }
        return [];
      });

      await expect(
        service.createRequest(mockUserId, 'different-key-1'),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.BAD_REQUEST,
      });
    });

    it('allows a new deletion request if prior FAILED request exhausted all attempts (terminal)', async () => {
      mockRequestRepo.findOne.mockResolvedValue(null);
      mockManager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM users')) return [{ id: mockUserId }];
        // Terminal failed request (attempt_count >= max_attempts) is excluded by query
        if (sql.includes('FROM deletion_requests')) return [];
        return [];
      });

      const result = await service.createRequest(mockUserId, 'new-key-after-terminal-failure');
      expect(result.isNew).toBe(true);
      expect(result.data.status).toBe(DeletionStatus.ACCEPTED);
    });

    it('rejects with NOT_FOUND if authenticated user does not exist in users table', async () => {
      mockRequestRepo.findOne.mockResolvedValue(null);
      mockManager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM users')) return []; // User missing/deleted
        return [];
      });

      try {
        await service.createRequest(mockUserId, mockIdempotencyKey);
        expect.unreachable();
      } catch (err: any) {
        expect(err.errorCode).toBe(AppErrorCode.NOT_FOUND);
        expect(err.message).toBe('المورد المطلوب غير موجود');
        expect(err.details).toEqual(['User account not found']);
      }
    });

    it('rolls back transaction if audit event insertion fails', async () => {
      mockRequestRepo.findOne.mockResolvedValue(null);
      mockManager.save.mockImplementation(async (entity: any, data: any) => {
        if (data.eventStatus === DeletionStatus.ACCEPTED) {
          throw new Error('Database audit insertion failure');
        }
        return { id: mockRequestId, ...data };
      });

      await expect(
        service.createRequest(mockUserId, mockIdempotencyKey),
      ).rejects.toThrow('Database audit insertion failure');

      expect(mockWorkerService.trigger).not.toHaveBeenCalled();
    });

    it('rejects with BAD_REQUEST if idempotency key belongs to another user', async () => {
      const otherUserId = '99999999-9999-9999-9999-999999999999';
      mockRequestRepo.findOne.mockResolvedValueOnce({
        id: mockRequestId,
        userId: otherUserId,
      });

      await expect(
        service.createRequest(mockUserId, mockIdempotencyKey),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.BAD_REQUEST,
      });
    });
  });

  describe('ISSUE 3 — Public Status Check Sanitization', () => {
    it('retains approved top-level stage keys and safe status values', () => {
      const raw = {
        revoke_sessions: 'COMPLETED',
        processing: 'FAILED',
        processing_started_at: '2026-11-22T20:00:00.000Z',
      };

      const sanitized = sanitizeStageStatus(raw);
      expect(sanitized).toEqual({
        revoke_sessions: 'COMPLETED',
        processing: 'FAILED',
        processing_started_at: '2026-11-22T20:00:00.000Z',
      });
    });

    it('strips purge_user_data as an unwritten stage', () => {
      const raw = {
        revoke_sessions: 'COMPLETED',
        purge_user_data: 'COMPLETED',
      };
      const sanitized = sanitizeStageStatus(raw);
      expect(sanitized).toEqual({
        revoke_sessions: 'COMPLETED',
      });
      expect(sanitized).not.toHaveProperty('purge_user_data');
    });

    it('strips unapproved keys, user IDs, errors, and passwords', () => {
      const raw = {
        revoke_sessions: 'COMPLETED',
        userId: mockUserId,
        user_id: mockUserId,
        error: 'Failed to connect to database',
        last_error: 'Connection timeout',
        password: 'admin',
        token: 'secret-token',
        secret_hash: 'abcdef',
      };

      const sanitized = sanitizeStageStatus(raw);
      expect(sanitized).toEqual({
        revoke_sessions: 'COMPLETED',
      });
      expect(sanitized).not.toHaveProperty('userId');
      expect(sanitized).not.toHaveProperty('user_id');
      expect(sanitized).not.toHaveProperty('error');
      expect(sanitized).not.toHaveProperty('last_error');
    });

    it('rejects nested malicious objects and arrays', () => {
      const raw = {
        revoke_sessions: { subKey: 'malicious', userId: '123' },
        processing: ['COMPLETED', { sql: 'SELECT * FROM users' }],
        processing_started_at: { $gt: '' },
      };

      const sanitized = sanitizeStageStatus(raw);
      expect(sanitized).toEqual({});
    });

    it('rejects SQL details, stack traces, and arbitrary error strings', () => {
      const raw = {
        revoke_sessions: 'SELECT * FROM users WHERE id = 1',
        processing: 'Error: at C:/Baseer/worker.ts:12:4',
      };

      const sanitized = sanitizeStageStatus(raw);
      expect(sanitized).toEqual({});
    });

    it('safely handles null, undefined, arrays, and primitive non-objects', () => {
      expect(sanitizeStageStatus(null)).toEqual({});
      expect(sanitizeStageStatus(undefined)).toEqual({});
      expect(sanitizeStageStatus([] as any)).toEqual({});
      expect(sanitizeStageStatus('malformed' as any)).toEqual({});
      expect(sanitizeStageStatus(12345 as any)).toEqual({});
    });

    it('correctly returns sanitized stageStatus in getStatus() endpoint', async () => {
      const { rawCapability, capabilityHash } = generateCapability();
      mockRequestRepo.findById.mockResolvedValue({
        id: mockRequestId,
        capabilityHash,
        status: DeletionStatus.COMPLETED,
        stageStatus: {
          revoke_sessions: 'COMPLETED',
          userId: mockUserId,
          error: 'Internal crash',
        },
        acceptedAt: new Date(),
        completedAt: new Date(),
        failureCode: null,
      });

      const status = await service.getStatus(mockRequestId, rawCapability);
      expect(status.stageStatus).toEqual({
        revoke_sessions: 'COMPLETED',
      });
      expect(status.stageStatus).not.toHaveProperty('userId');
      expect(status.stageStatus).not.toHaveProperty('error');
    });

    it('throws BAD_REQUEST with Arabic message and developer details when capability header is missing', async () => {
      try {
        await service.getStatus(mockRequestId, undefined);
        expect.unreachable();
      } catch (err: any) {
        expect(err.errorCode).toBe(AppErrorCode.BAD_REQUEST);
        expect(err.message).toBe('طلب غير صحيح');
        expect(err.details).toEqual(['Missing X-Deletion-Capability header']);
      }
    });

    it('throws NOT_FOUND with Arabic message and NO details when request does not exist', async () => {
      mockRequestRepo.findById.mockResolvedValue(null);

      try {
        await service.getStatus(mockRequestId, 'valid-format-cap-secret');
        expect.unreachable();
      } catch (err: any) {
        expect(err.errorCode).toBe(AppErrorCode.NOT_FOUND);
        expect(err.message).toBe('المورد المطلوب غير موجود');
        expect(err.details).toBeUndefined();
      }
    });

    it('throws NOT_FOUND with Arabic message and NO details when capability is invalid', async () => {
      const { capabilityHash } = generateCapability();
      mockRequestRepo.findById.mockResolvedValue({
        id: mockRequestId,
        capabilityHash,
        status: DeletionStatus.ACCEPTED,
      });

      try {
        await service.getStatus(mockRequestId, 'invalid-capability-secret-0000000000000000000000');
        expect.unreachable();
      } catch (err: any) {
        expect(err.errorCode).toBe(AppErrorCode.NOT_FOUND);
        expect(err.message).toBe('المورد المطلوب غير موجود');
        expect(err.details).toBeUndefined();
      }
    });
  });

  describe('ISSUE 4 — Idempotency-Key Validation', () => {
    it('rejects missing key with Arabic message and developer details', async () => {
      try {
        await service.createRequest(mockUserId, undefined);
        expect.unreachable();
      } catch (err: any) {
        expect(err.errorCode).toBe(AppErrorCode.BAD_REQUEST);
        expect(err.message).toBe('طلب غير صحيح');
        expect(err.details).toEqual(['Missing or empty Idempotency-Key header']);
      }
    });

    it('rejects empty key', async () => {
      await expect(service.createRequest(mockUserId, '')).rejects.toMatchObject(
        {
          errorCode: AppErrorCode.BAD_REQUEST,
        },
      );
    });

    it('rejects whitespace-only key', async () => {
      await expect(
        service.createRequest(mockUserId, '    '),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.BAD_REQUEST,
      });
    });

    it('rejects key exceeding maximum length (255 chars)', async () => {
      const longKey = 'a'.repeat(MAX_IDEMPOTENCY_KEY_LENGTH + 1);
      await expect(
        service.createRequest(mockUserId, longKey),
      ).rejects.toMatchObject({
        errorCode: AppErrorCode.BAD_REQUEST,
      });
    });

    it('accepts key with exactly maximum length (255 chars)', async () => {
      const maxKey = 'a'.repeat(MAX_IDEMPOTENCY_KEY_LENGTH);
      mockRequestRepo.findOne.mockResolvedValue(null);

      const result = await service.createRequest(mockUserId, maxKey);
      expect(result.isNew).toBe(true);
    });

    it('rejects keys with control characters or newlines', async () => {
      const invalidKeys = [
        'key\nwith\nnewline',
        'key\rwith\rcarriage',
        'key\x00withnull',
        'key\x1bwithcontrol',
      ];

      for (const invalidKey of invalidKeys) {
        await expect(
          service.createRequest(mockUserId, invalidKey),
        ).rejects.toMatchObject({
          errorCode: AppErrorCode.BAD_REQUEST,
        });
      }
    });

    it('never logs raw idempotency key', async () => {
      const secretKey = 'my-secret-idempotency-token-value';
      mockRequestRepo.findOne.mockResolvedValue(null);

      const logSpy = vi.spyOn(service['logger'], 'log');
      await service.createRequest(mockUserId, secretKey);

      for (const call of logSpy.mock.calls) {
        expect(call[0]).not.toContain(secretKey);
      }
    });
  });

  describe('ISSUE 5 — Request Reason Cleanup', () => {
    it('does not accept or require reason in createRequest()', async () => {
      mockRequestRepo.findOne.mockResolvedValue(null);

      // Call createRequest with only userId and idempotencyKey
      const result = await service.createRequest(
        mockUserId,
        mockIdempotencyKey,
      );
      expect(result.isNew).toBe(true);
    });
  });
});
