import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../exceptions/app.exception';
import { AppErrorCode } from '../constants/error-codes';
import {
  RATE_LIMIT_METADATA_KEY,
  RateLimitOptions,
} from '../decorators/rate-limit.decorator';

export interface TokenBucketState {
  tokens: number;
  lastRefillMs: number;
  lastAccessedMs: number;
}

/**
 * In-Memory Token Bucket Rate Limiting Guard.
 *
 * Architecture & Concurrency Notes:
 * 1. Process-Local Storage: Counters are held in a process-local in-memory Map.
 *    This implementation does NOT distribute counters across multiple clustered instances.
 *    For horizontal multi-replica deployments, a distributed store (e.g. Redis) is required.
 * 2. Concurrency Safety: Node.js executes JavaScript on a single-threaded event loop,
 *    guaranteeing atomic evaluation and decrement of bucket tokens without race conditions.
 * 3. Identity Strategy:
 *    - Authenticated Users (Registered & Guest): Extracts `userId` from `request.user.userId`
 *      (populated by `JwtAuthGuard`). Callers are strictly isolated per `userId`.
 *    - Unauthenticated Fallback: Falls back to client IP address (`req.ip` or forwarded IP).
 * 4. Memory Leak Prevention:
 *    - An active pruning mechanism sweeps idle buckets exceeding `maxIdleMs` (default 10 minutes).
 *    - The background interval is `unref()`-ed so it never blocks process termination or test runners.
 */
@Injectable()
export class TokenBucketRateLimitGuard implements CanActivate {
  private static readonly logger = new Logger(TokenBucketRateLimitGuard.name);
  private static readonly buckets = new Map<string, TokenBucketState>();
  private static cleanupTimer: NodeJS.Timeout | null = null;
  private static readonly DEFAULT_IDLE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  constructor(
    @Optional() private readonly reflector?: Reflector,
    @Optional() private readonly configService?: ConfigService,
  ) {
    TokenBucketRateLimitGuard.ensureCleanupScheduled();
  }

  canActivate(context: ExecutionContext): boolean {
    const options = this.resolveOptions(context);
    const capacity = options.capacity;
    const refillRate = options.refillRate;
    const cost = options.cost;
    const keyPrefix = options.keyPrefix || 'global';

    const request = context.switchToHttp().getRequest();
    const identityKey = this.resolveClientIdentity(request);
    const bucketKey = `${keyPrefix}:${identityKey}`;

    return this.consumeTokens(bucketKey, capacity, refillRate, cost);
  }

  /**
   * Evaluates token availability and consumes tokens atomically.
   */
  private consumeTokens(
    bucketKey: string,
    capacity: number,
    refillRate: number,
    cost: number,
  ): boolean {
    const now = Date.now();
    let state = TokenBucketRateLimitGuard.buckets.get(bucketKey);

    if (!state) {
      // First request: initialize bucket with full capacity minus the request cost
      if (capacity < cost) {
        throw new AppException(AppErrorCode.TOO_MANY_REQUESTS);
      }
      TokenBucketRateLimitGuard.buckets.set(bucketKey, {
        tokens: capacity - cost,
        lastRefillMs: now,
        lastAccessedMs: now,
      });
      return true;
    }

    // Refill tokens based on elapsed time
    const elapsedSeconds = Math.max(0, (now - state.lastRefillMs) / 1000);
    const refilledTokens = state.tokens + elapsedSeconds * refillRate;
    state.tokens = Math.min(capacity, refilledTokens);
    state.lastRefillMs = now;
    state.lastAccessedMs = now;

    if (state.tokens < cost) {
      TokenBucketRateLimitGuard.logger.warn(
        `Rate limit exceeded for bucket "${bucketKey}" [available: ${state.tokens.toFixed(2)}, cost: ${cost}]`,
      );
      throw new AppException(AppErrorCode.TOO_MANY_REQUESTS);
    }

    state.tokens -= cost;
    return true;
  }

  /**
   * Resolves the client identity following the established authentication policy.
   * Priority:
   * 1. Authenticated user ID (`request.user.userId` or `request.user.sub`)
   * 2. Client IP address (X-Forwarded-For or socket address)
   */
  private resolveClientIdentity(request: any): string {
    const user = request.user;
    const userId = user?.userId || user?.sub;

    if (userId && typeof userId === 'string') {
      return `user:${userId}`;
    }

    const forwardedFor = request.headers?.['x-forwarded-for'];
    const clientIp =
      (typeof forwardedFor === 'string'
        ? forwardedFor.split(',')[0].trim()
        : null) ||
      request.ip ||
      request.socket?.remoteAddress ||
      'unknown-client';

    return `ip:${clientIp}`;
  }

  /**
   * Resolves rate limit parameters from decorator metadata or environment variables.
   */
  private resolveOptions(context: ExecutionContext): Required<RateLimitOptions> {
    let metadata: RateLimitOptions | undefined;

    if (this.reflector && typeof context.getHandler === 'function') {
      metadata = this.reflector.getAllAndOverride<RateLimitOptions>(
        RATE_LIMIT_METADATA_KEY,
        [context.getHandler(), context.getClass()],
      );
    }

    const defaultCapacity = this.getEnvNumber(
      'VOICE_COMMAND_RATE_LIMIT_CAPACITY',
      10,
    );
    const defaultRefillRate = this.getEnvNumber(
      'VOICE_COMMAND_RATE_LIMIT_REFILL_RATE',
      1.0,
    );

    return {
      capacity: metadata?.capacity ?? defaultCapacity,
      refillRate: metadata?.refillRate ?? defaultRefillRate,
      cost: metadata?.cost ?? 1,
      keyPrefix: metadata?.keyPrefix ?? 'rate_limit',
    };
  }

  private getEnvNumber(key: string, defaultValue: number): number {
    const val = this.configService?.get<string>(key) ?? process.env[key];
    if (val !== undefined && val !== null && val !== '') {
      const parsed = parseFloat(val);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return defaultValue;
  }

  /**
   * Prunes buckets that have not been accessed within the idle TTL to prevent memory leaks.
   */
  private static sweepIdleBuckets(
    maxIdleMs: number = TokenBucketRateLimitGuard.DEFAULT_IDLE_TTL_MS,
  ): number {
    const now = Date.now();
    let prunedCount = 0;

    for (const [key, state] of TokenBucketRateLimitGuard.buckets.entries()) {
      if (now - state.lastAccessedMs > maxIdleMs) {
        TokenBucketRateLimitGuard.buckets.delete(key);
        prunedCount++;
      }
    }

    return prunedCount;
  }

  /**
   * Ensures the periodic cleanup timer is active.
   */
  private static ensureCleanupScheduled(): void {
    if (!TokenBucketRateLimitGuard.cleanupTimer) {
      TokenBucketRateLimitGuard.cleanupTimer = setInterval(() => {
        TokenBucketRateLimitGuard.sweepIdleBuckets();
      }, 5 * 60 * 1000); // Check every 5 minutes

      // Unref ensures this background interval does not block application teardown
      if (TokenBucketRateLimitGuard.cleanupTimer.unref) {
        TokenBucketRateLimitGuard.cleanupTimer.unref();
      }
    }
  }

  /**
   * Testing utility to reset in-memory buckets and stop timers between test runs.
   */
  public static resetForTesting(): void {
    TokenBucketRateLimitGuard.buckets.clear();
    if (TokenBucketRateLimitGuard.cleanupTimer) {
      clearInterval(TokenBucketRateLimitGuard.cleanupTimer);
      TokenBucketRateLimitGuard.cleanupTimer = null;
    }
  }

  /**
   * Testing utility to inspect stored bucket state.
   */
  public static getBucketStateForTesting(
    key: string,
  ): TokenBucketState | undefined {
    return TokenBucketRateLimitGuard.buckets.get(key);
  }

  /**
   * Testing utility to trigger idle bucket pruning explicitly.
   */
  public static triggerPruneForTesting(maxIdleMs?: number): number {
    return TokenBucketRateLimitGuard.sweepIdleBuckets(maxIdleMs);
  }
}
