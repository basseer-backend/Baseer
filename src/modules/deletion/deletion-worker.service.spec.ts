import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { EntityManager } from 'typeorm';
import { DeletionStatus } from './deletion.constants';
import { DeletionWorkerService } from './deletion-worker.service';

type TransactionFn = <T>(
  runInTransaction: (entityManager: EntityManager) => Promise<T>,
) => Promise<T>;

type QueryFn = (query: string, parameters?: any[]) => Promise<any>;

describe('DeletionWorkerService', () => {
  let worker: DeletionWorkerService;
  let mockDataSource: {
    transaction: ReturnType<typeof vi.fn<TransactionFn>>;
    query: ReturnType<typeof vi.fn<QueryFn>>;
  };
  let mockRequestRepo: {
    findById: ReturnType<typeof vi.fn>;
    updateOne: ReturnType<typeof vi.fn>;
  };
  let mockAuditEventRepo: {
    create: ReturnType<typeof vi.fn>;
  };
  let mockAuthSessionRepo: {
    revokeAllUserSessions: ReturnType<typeof vi.fn>;
  };
  let mockUserRepo: {
    deleteOne: ReturnType<typeof vi.fn>;
  };

  const mockRequestId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';

  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.DELETION_HMAC_SECRET =
      'valid-test-dedicated-hmac-secret-32-chars';
    vi.useFakeTimers();

    mockDataSource = {
      transaction: vi.fn(),
      query: vi.fn(),
    };
    mockRequestRepo = {
      findById: vi.fn(),
      updateOne: vi.fn(),
    };
    mockAuditEventRepo = {
      create: vi.fn(),
    };
    mockAuthSessionRepo = {
      revokeAllUserSessions: vi.fn().mockResolvedValue(undefined),
    };
    mockUserRepo = {
      deleteOne: vi.fn().mockResolvedValue({ affected: 1 }),
    };

    // Default transaction implementation delegating query calls to mockDataSource.query
    mockDataSource.transaction.mockImplementation(
      async (callback: (manager: EntityManager) => Promise<any>) => {
        const mockManager = {
          query: vi
            .fn()
            .mockImplementation((sql: string, params?: any[]) =>
              mockDataSource.query(sql, params),
            ),
        };
        return callback(mockManager as unknown as EntityManager);
      },
    );

    worker = new DeletionWorkerService(
      mockDataSource as any,
      mockRequestRepo as any,
      mockAuditEventRepo as any,
      mockAuthSessionRepo as any,
      mockUserRepo as any,
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.useRealTimers();
  });

  describe('claimNextJob', () => {
    it('returns null when no eligible jobs exist', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      const job = await worker.claimNextJob('test-worker-1');
      expect(job).toBeNull();
    });

    it('successfully claims an ACCEPTED job using database clock and appends a PROCESSING audit event', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([
          {
            id: mockRequestId,
            user_id: mockUserId,
            status: DeletionStatus.ACCEPTED,
            attempt_count: 0,
            max_attempts: 3,
          },
        ])
        .mockResolvedValue([]);

      const job = await worker.claimNextJob('test-worker-1');

      expect(job).not.toBeNull();
      expect(job?.requestId).toBe(mockRequestId);
      expect(job?.userId).toBe(mockUserId);
      expect(job?.attemptCount).toBe(1);

      // Verify UPDATE set status to PROCESSING with lease using database clock
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE deletion_requests"),
        expect.arrayContaining(['test-worker-1', 300, 1, mockRequestId]),
      );

      // Verify PROCESSING audit event was inserted
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO deletion_audit_events"),
        expect.arrayContaining([mockRequestId, expect.any(String), expect.any(Number)]),
      );
    });

    it('claims and recovers an expired lease from a crashed worker', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([
          {
            id: mockRequestId,
            user_id: mockUserId,
            status: DeletionStatus.PROCESSING,
            attempt_count: 1,
            max_attempts: 3,
          },
        ])
        .mockResolvedValue([]);

      const job = await worker.claimNextJob('recovery-worker-2');

      expect(job).not.toBeNull();
      expect(job?.attemptCount).toBe(2);
    });
  });

  describe('processNextJob (Authoritative Execution & Fencing)', () => {
    it('returns false when no jobs are available', async () => {
      vi.spyOn(worker, 'claimNextJob').mockResolvedValue(null);

      const handled = await worker.processNextJob();
      expect(handled).toBe(false);
    });

    it('revokes sessions, executes fenced complete_account_deletion, and verifies COMPLETED status', async () => {
      vi.spyOn(worker, 'claimNextJob').mockResolvedValue({
        requestId: mockRequestId,
        userId: mockUserId,
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockDataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes('stage_status')) {
          return [{ id: mockRequestId }];
        }
        if (sql.includes('SELECT status FROM deletion_requests')) {
          return [{ status: DeletionStatus.COMPLETED }];
        }
        return [];
      });

      const handled = await worker.processNextJob('test-worker-1');

      expect(handled).toBe(true);

      // 1. User sessions revoked
      expect(mockAuthSessionRepo.revokeAllUserSessions).toHaveBeenCalledWith(mockUserId);

      // 2. Fenced complete_account_deletion function invoked with worker ID parameter
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('complete_account_deletion'),
        expect.arrayContaining([mockRequestId, expect.any(String), expect.any(Number), 'test-worker-1']),
      );

      // 3. Verified persisted COMPLETED state
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT status FROM deletion_requests WHERE id = $1'),
        [mockRequestId],
      );
    });

    it('propagates stored function failure to failure handling WITHOUT any programmatic purge fallback', async () => {
      vi.spyOn(worker, 'claimNextJob').mockResolvedValue({
        requestId: mockRequestId,
        userId: mockUserId,
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockDataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes('stage_status')) {
          return [{ id: mockRequestId }];
        }
        if (sql.includes('complete_account_deletion')) {
          throw new Error('Database constraint or connectivity error during complete_account_deletion');
        }
        if (sql.includes("SET status = 'FAILED'")) {
          return [{ id: mockRequestId }]; // lease still owned
        }
        return [];
      });

      const handled = await worker.processNextJob('test-worker-1');
      expect(handled).toBe(true);

      // Must NEVER directly delete user or fall back to alternative purge
      expect(mockUserRepo.deleteOne).not.toHaveBeenCalled();

      // Must route to failure handling
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'FAILED'"),
        expect.arrayContaining([
          'ERR_TRANSIENT_PROCESSING_FAILURE',
          expect.any(String),
          mockRequestId,
          'test-worker-1',
        ]),
      );
    });

    it('marks failure if stored function does not persist COMPLETED status', async () => {
      vi.spyOn(worker, 'claimNextJob').mockResolvedValue({
        requestId: mockRequestId,
        userId: mockUserId,
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockDataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes('stage_status')) {
          return [{ id: mockRequestId }];
        }
        if (sql.includes('SELECT status FROM deletion_requests')) {
          return [{ status: DeletionStatus.PROCESSING }];
        }
        if (sql.includes("SET status = 'FAILED'")) {
          return [{ id: mockRequestId }];
        }
        return [];
      });

      const handled = await worker.processNextJob('test-worker-1');
      expect(handled).toBe(true);

      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'FAILED'"),
        expect.arrayContaining(['ERR_TRANSIENT_PROCESSING_FAILURE']),
      );
    });
  });

  describe('Strict Lease Validation & Fail-Closed Heartbeat', () => {
    it('renews lease with strict clock_timestamp check and reject NULL expiry', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ id: mockRequestId }]);

      const renewed = await worker.renewLease(mockRequestId, 'test-worker-1');
      expect(renewed).toBe(true);

      // Proves strictly validates NOT NULL and database clock
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringMatching(/lease_expires_at IS NOT NULL[\s\S]*lease_expires_at > clock_timestamp\(\)/),
        expect.arrayContaining([300, mockRequestId, 'test-worker-1']),
      );
    });

    it('rejects renewal when lease is expired or not held by worker', async () => {
      mockDataSource.query.mockResolvedValueOnce([]); // 0 rows updated

      const renewed = await worker.renewLease(mockRequestId, 'stale-worker');
      expect(renewed).toBe(false);
    });

    it('fail-closed: heartbeat error halts processing before final purge', async () => {
      vi.spyOn(worker, 'claimNextJob').mockResolvedValue({
        requestId: mockRequestId,
        userId: mockUserId,
        attemptCount: 1,
        maxAttempts: 3,
      });

      // Heartbeat renewal throws DB connection error
      vi.spyOn(worker, 'renewLease').mockRejectedValue(
        new Error('DB connection reset during heartbeat'),
      );

      mockDataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes('stage_status')) {
          // Trigger heartbeat during stage update
          vi.advanceTimersByTime(30000);
          return [{ id: mockRequestId }];
        }
        if (sql.includes("SET status = 'FAILED'")) {
          return [{ id: mockRequestId }];
        }
        return [];
      });

      const handled = await worker.processNextJob('test-worker-1');
      expect(handled).toBe(true);

      // Must NOT proceed to complete_account_deletion after unverified heartbeat
      expect(mockDataSource.query).not.toHaveBeenCalledWith(
        expect.stringContaining('SELECT complete_account_deletion'),
        expect.anything(),
      );
    });

    it('fail-closed: heartbeat returning false halts processing before final purge', async () => {
      vi.spyOn(worker, 'claimNextJob').mockResolvedValue({
        requestId: mockRequestId,
        userId: mockUserId,
        attemptCount: 1,
        maxAttempts: 3,
      });

      // Heartbeat renewal returns false (lease lost to another worker)
      vi.spyOn(worker, 'renewLease').mockResolvedValue(false);

      mockDataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes('stage_status')) {
          vi.advanceTimersByTime(30000);
          return [{ id: mockRequestId }];
        }
        if (sql.includes("SET status = 'FAILED'")) {
          return [{ id: mockRequestId }];
        }
        return [];
      });

      const handled = await worker.processNextJob('test-worker-1');
      expect(handled).toBe(true);

      expect(mockDataSource.query).not.toHaveBeenCalledWith(
        expect.stringContaining('SELECT complete_account_deletion'),
        expect.anything(),
      );
    });
  });

  describe('Atomic Failure Handling and Rollback', () => {
    it('executes status update and audit insertion atomically inside a single transaction', async () => {
      vi.spyOn(worker, 'claimNextJob').mockResolvedValue({
        requestId: mockRequestId,
        userId: mockUserId,
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockAuthSessionRepo.revokeAllUserSessions.mockRejectedValue(
        new Error('Transient failure'),
      );

      mockDataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes("SET status = 'FAILED'")) {
          return [{ id: mockRequestId }];
        }
        return [];
      });

      await worker.processNextJob('test-worker-1');

      // Transaction must have been used
      expect(mockDataSource.transaction).toHaveBeenCalled();

      // Status update performed
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'FAILED'"),
        expect.anything(),
      );

      // Audit event appended
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringMatching(/INSERT INTO deletion_audit_events[\s\S]*'FAILED'/),
        expect.arrayContaining([mockRequestId]),
      );
    });

    it('rolls back status update if audit event insertion throws an error', async () => {
      vi.spyOn(worker, 'claimNextJob').mockResolvedValue({
        requestId: mockRequestId,
        userId: mockUserId,
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockAuthSessionRepo.revokeAllUserSessions.mockRejectedValue(
        new Error('Transient error'),
      );

      // Transaction rolls back when query inside it throws
      mockDataSource.transaction.mockImplementation(
        async (callback: (manager: EntityManager) => Promise<any>) => {
          const mockManager = {
            query: vi.fn().mockImplementation(async (sql: string) => {
              if (sql.includes("SET status = 'FAILED'")) {
                return [{ id: mockRequestId }];
              }
              if (sql.includes("INSERT INTO deletion_audit_events")) {
                throw new Error(
                  'Audit table constraint violation during rollback test',
                );
              }
              return [];
            }),
          };
          // If callback throws, transaction propagates rejection and rolls back
          return callback(mockManager as unknown as EntityManager);
        },
      );

      await expect(
        worker.processNextJob('test-worker-1'),
      ).rejects.toThrow('Audit table constraint violation during rollback test');
    });

    it('stale worker does NOT append FAILED audit event if lease was lost to another worker', async () => {
      vi.spyOn(worker, 'claimNextJob').mockResolvedValue({
        requestId: mockRequestId,
        userId: mockUserId,
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockAuthSessionRepo.revokeAllUserSessions.mockRejectedValue(
        new Error('Network error during session revocation'),
      );

      // When attempting to mark FAILED, 0 rows match because newer worker owns lease
      mockDataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes("SET status = 'FAILED'")) {
          return []; // 0 rows affected (stale!)
        }
        return [];
      });

      const handled = await worker.processNextJob('stale-worker-1');
      expect(handled).toBe(true);

      // Must NOT append misleading FAILED audit event
      expect(mockDataSource.query).not.toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO deletion_audit_events"),
        expect.arrayContaining(['FAILED']),
      );
    });
  });

  describe('Sanitized Error Logging', () => {
    it('does not log raw database error messages, stack traces, or credentials', async () => {
      vi.spyOn(worker, 'claimNextJob').mockResolvedValue({
        requestId: mockRequestId,
        userId: mockUserId,
        attemptCount: 1,
        maxAttempts: 3,
      });

      mockAuthSessionRepo.revokeAllUserSessions.mockRejectedValue(
        new Error('FATAL: password authentication failed for user "postgres" SELECT * FROM secrets'),
      );

      const errorSpy = vi.spyOn(worker['logger'], 'error');
      const warnSpy = vi.spyOn(worker['logger'], 'warn');

      mockDataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes("SET status = 'FAILED'")) {
          return [{ id: mockRequestId }];
        }
        return [];
      });

      await worker.processNextJob('test-worker-1');

      // Verify no raw DB error message or secrets in error/warn logs
      for (const call of errorSpy.mock.calls) {
        expect(call[0]).not.toContain('password authentication failed');
        expect(call[0]).not.toContain('SELECT * FROM secrets');
        expect(call[0]).not.toContain(mockUserId);
      }

      for (const call of warnSpy.mock.calls) {
        expect(call[0]).not.toContain('password authentication failed');
        expect(call[0]).not.toContain('SELECT * FROM secrets');
        expect(call[0]).not.toContain(mockUserId);
      }
    });
  });

  describe('Polling and Immediate Trigger Mechanics', () => {
    it('schedules subsequent polling uninterruptedly after immediate trigger', () => {
      worker.onModuleInit();
      expect(worker['pollTimer']).not.toBeNull();

      worker.trigger();
      expect(worker['pollTimer']).not.toBeNull();
    });

    it('flags pending trigger if trigger occurs during active processing', async () => {
      worker['isProcessing'] = true;

      worker.trigger();
      expect(worker['hasPendingTrigger']).toBe(true);

      worker['isProcessing'] = false;
    });
  });

  describe('Graceful Shutdown', () => {
    it('clears timers and waits for active cycle during shutdown', async () => {
      worker.onModuleInit();
      expect(worker['pollTimer']).not.toBeNull();

      let resolveActive: () => void = () => {};
      worker['activeProcessingPromise'] = new Promise((resolve) => {
        resolveActive = resolve;
      });

      const shutdownPromise = worker.onApplicationShutdown('SIGTERM');
      expect(worker['isShuttingDown']).toBe(true);
      expect(worker['pollTimer']).toBeNull();

      resolveActive();
      await shutdownPromise;
    });
  });
});
