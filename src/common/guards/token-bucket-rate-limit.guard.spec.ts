import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenBucketRateLimitGuard } from './token-bucket-rate-limit.guard';
import { AppException } from '../exceptions/app.exception';
import { AppErrorCode } from '../constants/error-codes';
import { RATE_LIMIT_METADATA_KEY } from '../decorators/rate-limit.decorator';

describe('TokenBucketRateLimitGuard', () => {
  let guard: TokenBucketRateLimitGuard;
  let reflector: Reflector;

  beforeEach(() => {
    vi.useFakeTimers();
    TokenBucketRateLimitGuard.resetForTesting();
    reflector = new Reflector();
    guard = new TokenBucketRateLimitGuard(reflector);
  });

  afterEach(() => {
    TokenBucketRateLimitGuard.resetForTesting();
    vi.useRealTimers();
  });

  function createMockContext(user?: any, ip = '127.0.0.1'): ExecutionContext {
    const request = {
      user,
      ip,
      headers: {},
      socket: { remoteAddress: ip },
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  it('accepts requests within bucket capacity', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      capacity: 5,
      refillRate: 1,
      cost: 1,
      keyPrefix: 'test',
    });

    const ctx = createMockContext({ userId: 'user-1' });

    for (let i = 0; i < 5; i++) {
      expect(guard.canActivate(ctx)).toBe(true);
    }
  });

  it('rejects requests exceeding bucket capacity with ERR_TOO_MANY_REQUESTS', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      capacity: 3,
      refillRate: 1,
      cost: 1,
      keyPrefix: 'test',
    });

    const ctx = createMockContext({ userId: 'user-1' });

    // Consume 3 tokens
    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);

    // 4th request must be rejected
    expect(() => guard.canActivate(ctx)).toThrow(AppException);

    try {
      guard.canActivate(ctx);
    } catch (err: any) {
      expect(err).toBeInstanceOf(AppException);
      expect(err.errorCode).toBe(AppErrorCode.TOO_MANY_REQUESTS);
      expect(err.getStatus()).toBe(429);
    }
  });

  it('refills tokens over time at the configured refill rate', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      capacity: 2,
      refillRate: 1, // 1 token per second
      cost: 1,
      keyPrefix: 'test',
    });

    const ctx = createMockContext({ userId: 'user-1' });

    // Exhaust bucket
    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(() => guard.canActivate(ctx)).toThrow(AppException);

    // Advance time by 1.5 seconds -> refilled ~1.5 tokens
    vi.advanceTimersByTime(1500);

    // Should now be able to consume 1 token
    expect(guard.canActivate(ctx)).toBe(true);

    // But another immediately fails
    expect(() => guard.canActivate(ctx)).toThrow(AppException);
  });

  it('strictly isolates rate limit buckets between different users', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      capacity: 2,
      refillRate: 0.1,
      cost: 1,
      keyPrefix: 'voice',
    });

    const user1Ctx = createMockContext({ userId: 'user-1' });
    const user2Ctx = createMockContext({ userId: 'user-2' });

    // Exhaust user 1
    expect(guard.canActivate(user1Ctx)).toBe(true);
    expect(guard.canActivate(user1Ctx)).toBe(true);
    expect(() => guard.canActivate(user1Ctx)).toThrow(AppException);

    // User 2 must still have their own full bucket
    expect(guard.canActivate(user2Ctx)).toBe(true);
    expect(guard.canActivate(user2Ctx)).toBe(true);
    expect(() => guard.canActivate(user2Ctx)).toThrow(AppException);
  });

  it('handles guest users and registered users with userId isolation', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      capacity: 2,
      refillRate: 1,
      cost: 1,
      keyPrefix: 'voice',
    });

    const registeredCtx = createMockContext({ userId: 'registered-uuid', isGuest: false });
    const guestCtx = createMockContext({ userId: 'guest-uuid', isGuest: true });

    // Registered user exhausts
    expect(guard.canActivate(registeredCtx)).toBe(true);
    expect(guard.canActivate(registeredCtx)).toBe(true);
    expect(() => guard.canActivate(registeredCtx)).toThrow(AppException);

    // Guest user is not blocked
    expect(guard.canActivate(guestCtx)).toBe(true);
  });

  it('falls back to IP address when user object is absent', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      capacity: 1,
      refillRate: 1,
      cost: 1,
      keyPrefix: 'ip-test',
    });

    const ip1Ctx = createMockContext(undefined, '192.168.1.10');
    const ip2Ctx = createMockContext(undefined, '10.0.0.5');

    // IP 1 exhausts
    expect(guard.canActivate(ip1Ctx)).toBe(true);
    expect(() => guard.canActivate(ip1Ctx)).toThrow(AppException);

    // IP 2 is unaffected
    expect(guard.canActivate(ip2Ctx)).toBe(true);
  });

  it('prunes idle buckets exceeding maxIdleMs to prevent memory leaks', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      capacity: 5,
      refillRate: 1,
      cost: 1,
      keyPrefix: 'prune-test',
    });

    const ctx1 = createMockContext({ userId: 'user-active' });
    const ctx2 = createMockContext({ userId: 'user-idle' });

    guard.canActivate(ctx1);
    guard.canActivate(ctx2);

    expect(TokenBucketRateLimitGuard.getBucketStateForTesting('prune-test:user:user-idle')).toBeDefined();

    // Advance 11 minutes (exceeding default 10m idle TTL)
    vi.advanceTimersByTime(11 * 60 * 1000);

    // Touch ctx1 so it remains active
    guard.canActivate(ctx1);

    // Trigger explicit sweep with 10 min idle threshold
    const pruned = TokenBucketRateLimitGuard.triggerPruneForTesting(10 * 60 * 1000);
    expect(pruned).toBe(1);

    // Idle bucket must be pruned
    expect(TokenBucketRateLimitGuard.getBucketStateForTesting('prune-test:user:user-idle')).toBeUndefined();
    // Active bucket must remain
    expect(TokenBucketRateLimitGuard.getBucketStateForTesting('prune-test:user:user-active')).toBeDefined();
  });
});
