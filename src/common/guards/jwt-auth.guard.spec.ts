import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AppException } from '../exceptions/app.exception';
import { AppErrorCode } from '../constants/error-codes';
import { signJwt } from '../helpers/jwt.helper';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  const testSecret = 'test-secret-key-for-jwt-guard-testing-32-chars';

  beforeEach(() => {
    process.env.JWT_SECRET = testSecret;
    guard = new JwtAuthGuard();
  });

  function createMockContext(authHeader?: string): {
    context: ExecutionContext;
    request: any;
  } {
    const request: any = {
      headers: authHeader ? { authorization: authHeader } : {},
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    return { context, request };
  }

  describe('Unauthenticated Rejection', () => {
    it('should throw UNAUTHORIZED when Authorization header is missing', () => {
      const { context } = createMockContext();
      expect(() => guard.canActivate(context)).toThrow(AppException);
      try {
        guard.canActivate(context);
      } catch (err: any) {
        expect(err.errorCode).toBe(AppErrorCode.UNAUTHORIZED);
      }
    });

    it('should throw UNAUTHORIZED when header does not start with Bearer', () => {
      const { context } = createMockContext('Basic dXNlcjpwYXNz');
      expect(() => guard.canActivate(context)).toThrow(AppException);
    });

    it('should throw UNAUTHORIZED when token segment is empty', () => {
      const { context } = createMockContext('Bearer ');
      expect(() => guard.canActivate(context)).toThrow(AppException);
    });

    it('should throw UNAUTHORIZED when token has invalid signature', () => {
      const validToken = signJwt({ sub: 'user-1' }, 'wrong-secret');
      const { context } = createMockContext(`Bearer ${validToken}`);
      expect(() => guard.canActivate(context)).toThrow(AppException);
    });

    it('should throw UNAUTHORIZED when token is expired', () => {
      // Create expired token (-10 seconds)
      const expiredToken = signJwt({ sub: 'user-1' }, testSecret, -10);
      const { context } = createMockContext(`Bearer ${expiredToken}`);
      expect(() => guard.canActivate(context)).toThrow(AppException);
    });

    it('should throw UNAUTHORIZED when token payload has no sub or userId', () => {
      const invalidPayloadToken = signJwt({ sub: '' }, testSecret);
      const { context } = createMockContext(`Bearer ${invalidPayloadToken}`);
      expect(() => guard.canActivate(context)).toThrow(AppException);
    });
    it('should throw UNAUTHORIZED when refresh token is presented as Bearer token', () => {
      const refreshToken = signJwt({ sub: 'user-1', type: 'refresh' }, testSecret);
      const { context } = createMockContext(`Bearer ${refreshToken}`);
      expect(() => guard.canActivate(context)).toThrow(AppException);
    });

    it('should allow public routes when reflector detects isPublic', () => {
      const mockReflector = {
        getAllAndOverride: () => true,
      } as any;
      const publicGuard = new JwtAuthGuard(mockReflector);
      const { context } = createMockContext(); // no auth header

      expect(publicGuard.canActivate(context)).toBe(true);
    });
  });

  describe('Authenticated Acceptance', () => {
    it('should accept valid token and attach user to request', () => {
      const userId = '11111111-2222-3333-4444-555555555555';
      const token = signJwt({ sub: userId, isGuest: false }, testSecret);
      const { context, request } = createMockContext(`Bearer ${token}`);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(request.user).toBeDefined();
      expect(request.user.userId).toBe(userId);
      expect(request.user.isGuest).toBe(false);
    });

    it('should accept a valid Guest Access Token (isGuest: true) — guests are allowed on feature APIs', () => {
      const guestUserId = 'gggggggg-gggg-gggg-gggg-gggggggggggg';
      const guestToken = signJwt(
        { sub: guestUserId, isGuest: true, type: 'access' },
        testSecret,
      );
      const { context, request } = createMockContext(`Bearer ${guestToken}`);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(request.user.userId).toBe(guestUserId);
      expect(request.user.isGuest).toBe(true);
    });

    it('should accept a valid Registered Access Token (isGuest: false)', () => {
      const regUserId = 'rrrrrrrr-rrrr-rrrr-rrrr-rrrrrrrrrrrr';
      const regToken = signJwt(
        { sub: regUserId, isGuest: false, type: 'access' },
        testSecret,
      );
      const { context, request } = createMockContext(`Bearer ${regToken}`);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(request.user.userId).toBe(regUserId);
      expect(request.user.isGuest).toBe(false);
    });
  });

  describe('Refresh Token Rejection', () => {
    it('should throw UNAUTHORIZED when a Refresh Token is used as Bearer access token', () => {
      // A refresh token signed with the same secret still has type: "refresh"
      const refreshToken = signJwt({ sub: 'user-rf', type: 'refresh', familyId: 'fam-1' }, testSecret);
      const { context } = createMockContext(`Bearer ${refreshToken}`);
      expect(() => guard.canActivate(context)).toThrow(AppException);
      try {
        guard.canActivate(context);
      } catch (err: any) {
        expect(err.errorCode).toBe(AppErrorCode.UNAUTHORIZED);
      }
    });
  });
});
