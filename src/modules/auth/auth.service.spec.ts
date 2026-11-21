import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from './auth.service';
import { UserRepository } from '../../database/repositories/user.repository';
import { AuthSessionRepository } from '../../database/repositories/auth-session.repository';
import { AppException } from '../../common/exceptions/app.exception';
import {
  signAccessToken,
  signRefreshToken,
  hashToken,
} from '../../common/helpers/jwt.helper';

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: {
    findById: ReturnType<typeof vi.fn>;
  };
  let sessionRepo: {
    findByRefreshTokenHash: ReturnType<typeof vi.fn>;
    revokeFamily: ReturnType<typeof vi.fn>;
    revokeSession: ReturnType<typeof vi.fn>;
    revokeAllUserSessions: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let dataSource: {
    transaction: ReturnType<typeof vi.fn>;
  };

  const mockUser = {
    id: 'user-uuid-123',
    preferredLanguage: 'ar-EG',
    isGuest: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    userRepo = {
      findById: vi.fn(),
    };
    sessionRepo = {
      findByRefreshTokenHash: vi.fn(),
      revokeFamily: vi.fn(),
      revokeSession: vi.fn(),
      revokeAllUserSessions: vi.fn(),
      create: vi.fn(),
    };
    dataSource = {
      transaction: vi.fn(async (cb) => {
        const manager = {
          create: vi.fn((_entity, data) => ({ id: 'new-id', ...data })),
          save: vi.fn((_entity, entity) => Promise.resolve(entity)),
        };
        return cb(manager);
      }),
    };

    service = new AuthService(
      userRepo as unknown as UserRepository,
      sessionRepo as unknown as AuthSessionRepository,
      dataSource as any,
    );
  });

  describe('guest', () => {
    it('should create an anonymous guest user with tokens matching the Baseer DB schema', async () => {
      const result = await service.guest({
        preferredLanguage: 'ar-EG',
        devicePlatform: 'flutter',
      });

      expect(result.user.isGuest).toBe(true);
      expect(result.user.preferredLanguage).toBe('ar-EG');
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
    });
  });

  describe('refresh', () => {
    it('should rotate tokens for a valid refresh token', async () => {
      const familyId = 'family-uuid-1';
      const refreshToken = signRefreshToken({
        sub: mockUser.id,
        familyId,
      });
      const tokenHash = hashToken(refreshToken);

      sessionRepo.findByRefreshTokenHash.mockResolvedValue({
        id: 'session-1',
        userId: mockUser.id,
        familyId,
        refreshTokenHash: tokenHash,
        devicePlatform: 'android',
        issuedAt: new Date(Date.now() - 1000),
        expiresAt: new Date(Date.now() + 100000),
        rotatedAt: null,
        revokedAt: null,
      });
      userRepo.findById.mockResolvedValue(mockUser);

      const result = await service.refresh({ refreshToken });

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.refreshToken).not.toBe(refreshToken);
    });

    it('should detect token reuse and revoke the entire family', async () => {
      const familyId = 'family-compromised-1';
      const refreshToken = signRefreshToken({
        sub: mockUser.id,
        familyId,
      });
      const tokenHash = hashToken(refreshToken);

      // Session was ALREADY rotated
      sessionRepo.findByRefreshTokenHash.mockResolvedValue({
        id: 'session-compromised',
        userId: mockUser.id,
        familyId,
        refreshTokenHash: tokenHash,
        rotatedAt: new Date(Date.now() - 5000),
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(service.refresh({ refreshToken })).rejects.toThrowError(
        AppException,
      );

      // Verifies entire family was invalidated for security
      expect(sessionRepo.revokeFamily).toHaveBeenCalledWith(familyId);
    });

    it('should reject access token presented as refresh token', async () => {
      const accessToken = signAccessToken({
        sub: mockUser.id,
      });

      await expect(
        service.refresh({ refreshToken: accessToken }),
      ).rejects.toThrowError(AppException);
    });
  });

  describe('logout', () => {
    it('should revoke all user sessions when no token provided', async () => {
      const result = await service.logout('user-1');
      expect(result.success).toBe(true);
      expect(sessionRepo.revokeAllUserSessions).toHaveBeenCalledWith('user-1');
    });

    it('should revoke specific session when refresh token is provided', async () => {
      const refreshToken = 'some-token';
      const tokenHash = hashToken(refreshToken);
      const session = { id: 's1', refreshTokenHash: tokenHash, revokedAt: null };
      sessionRepo.findByRefreshTokenHash.mockResolvedValue(session);

      const result = await service.logout('user-1', { refreshToken });
      expect(result.success).toBe(true);
      expect(session.revokedAt).toBeDefined();
    });
  });

  describe('getMe', () => {
    it('should return safe user profile for active user', async () => {
      userRepo.findById.mockResolvedValue(mockUser);

      const profile = await service.getMe(mockUser.id);
      expect(profile.id).toBe(mockUser.id);
      expect(profile.isGuest).toBe(true);
      expect(profile.preferredLanguage).toBe('ar-EG');
    });

    it('should throw NOT_FOUND for unknown user', async () => {
      userRepo.findById.mockResolvedValue(null);

      await expect(service.getMe('unknown')).rejects.toThrowError(AppException);
    });
  });
});
