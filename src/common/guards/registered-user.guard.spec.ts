import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionContext } from '@nestjs/common';
import { RegisteredUserGuard } from './registered-user.guard';
import { AppException } from '../exceptions/app.exception';

describe('RegisteredUserGuard', () => {
  let guard: RegisteredUserGuard;

  const createMockContext = (user?: any): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    guard = new RegisteredUserGuard();
  });

  it('should allow registered users (isGuest: false)', () => {
    const context = createMockContext({ userId: 'u1', isGuest: false });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should reject guest users (isGuest: true) with FORBIDDEN', () => {
    const context = createMockContext({ userId: 'u2', isGuest: true });
    expect(() => guard.canActivate(context)).toThrowError(AppException);
  });

  it('should reject unauthenticated request with UNAUTHORIZED', () => {
    const context = createMockContext(undefined);
    expect(() => guard.canActivate(context)).toThrowError(AppException);
  });
});
