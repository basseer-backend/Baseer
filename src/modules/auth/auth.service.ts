import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';
import { UserRepository } from '../../database/repositories/user.repository';
import { AuthSessionRepository } from '../../database/repositories/auth-session.repository';
import { User } from '../../database/entities/user.entity';
import { AuthSession } from '../../database/entities/auth-session.entity';
import { UserPreference } from '../../database/entities/user-preference.entity';
import { AppException } from '../../common/exceptions/app.exception';
import { AppErrorCode } from '../../common/constants/error-codes';
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getJwtAccessExpiresIn,
  getJwtRefreshExpiresIn,
} from '../../common/helpers/jwt.helper';
import {
  GuestAuthDto,
  RefreshTokenDto,
  LogoutDto,
  UserProfileDto,
  TokenBundleDto,
  AuthResponseDto,
} from './dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly sessionRepo: AuthSessionRepository,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Create an anonymous guest user session with scoped JWT tokens and default preferences.
   * Aligns 100% with Baseer's users and auth_sessions database schema.
   */
  async guest(dto: GuestAuthDto): Promise<AuthResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const guestUser = manager.create(User, {
        isGuest: true,
        preferredLanguage: dto.preferredLanguage || 'ar-EG',
      });

      const savedUser = await manager.save(User, guestUser);

      // Create default user preferences for the new user
      const preference = manager.create(UserPreference, {
        userId: savedUser.id,
        speechRate: '1.00',
        highContrastEnabled: false,
        hapticEnabled: true,
        hapticIntensity: 'medium',
        voiceWakeWordEnabled: false,
        cloudAiConsent: false,
        diagnosticAnalyticsConsent: false,
        consentPolicyVersion: null,
        consentUpdatedAt: null,
      });
      await manager.save(UserPreference, preference);

      const tokens = await this.issueTokenBundle(
        savedUser,
        dto.devicePlatform || 'flutter',
        manager,
      );

      return {
        user: this.mapToProfile(savedUser),
        tokens,
      };
    });
  }

  /**
   * Rotate refresh token and issue a fresh access token with token-family reuse detection.
   */
  async refresh(dto: RefreshTokenDto): Promise<TokenBundleDto> {
    // 1. Verify token signature, structure, and expiration
    let payload;
    try {
      payload = verifyRefreshToken(dto.refreshToken);
    } catch {
      throw new AppException(
        AppErrorCode.UNAUTHORIZED,
        'رمز التحديث غير صالح أو منتهي الصلاحية',
      );
    }

    const tokenHash = hashToken(dto.refreshToken);

    // 2. Lookup session in database
    const session = await this.sessionRepo.findByRefreshTokenHash(tokenHash);
    if (!session) {
      throw new AppException(
        AppErrorCode.UNAUTHORIZED,
        'جلسة المصادقة غير صالحة',
      );
    }

    // 3. Token Reuse Detection
    // If the token was already rotated or revoked, a compromised token is being replayed!
    if (session.rotatedAt !== null || session.revokedAt !== null) {
      // Invalidate the entire token family immediately
      await this.sessionRepo.revokeFamily(session.familyId);
      throw new AppException(
        AppErrorCode.UNAUTHORIZED,
        'تم الكشف عن محاولة استخدام غير مصرح بها للرمز، تم إنهاء جميع جلسات هذا الجهاز لأسباب أمنية',
      );
    }

    // 4. Check session expiration timestamp
    if (new Date() >= session.expiresAt) {
      throw new AppException(
        AppErrorCode.UNAUTHORIZED,
        'انتهت صلاحية جلسة التحديث، يرجى تسجيل الدخول مجدداً',
      );
    }

    // 5. Verify user status
    const user = await this.userRepo.findById(session.userId);
    if (!user) {
      throw new AppException(
        AppErrorCode.UNAUTHORIZED,
        'المستخدم المطلوب غير موجود في النظام',
      );
    }

    // 6. Perform atomic token rotation
    return this.dataSource.transaction(async (manager) => {
      // Mark current session as rotated
      session.rotatedAt = new Date();
      await manager.save(AuthSession, session);

      // Generate new rotated tokens within the SAME token family
      const newAccessToken = signAccessToken({
        sub: user.id,
        isGuest: user.isGuest,
      });

      const newRefreshToken = signRefreshToken({
        sub: user.id,
        isGuest: user.isGuest,
        familyId: session.familyId,
      });

      const newSession = manager.create(AuthSession, {
        userId: user.id,
        familyId: session.familyId,
        refreshTokenHash: hashToken(newRefreshToken),
        devicePlatform:
          dto.devicePlatform || session.devicePlatform || 'unknown',
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + getJwtRefreshExpiresIn() * 1000),
        rotatedAt: null,
        revokedAt: null,
      });
      await manager.save(AuthSession, newSession);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        tokenType: 'Bearer',
        expiresIn: getJwtAccessExpiresIn(),
      };
    });
  }

  /**
   * Revoke session or refresh token on logout.
   */
  async logout(
    userId: string,
    dto?: LogoutDto,
  ): Promise<{ success: boolean; message: string }> {
    if (dto?.refreshToken) {
      const tokenHash = hashToken(dto.refreshToken);
      const session = await this.sessionRepo.findByRefreshTokenHash(tokenHash);
      if (session) {
        session.revokedAt = new Date();
        await this.sessionRepo.create(session);
      }
    } else {
      // Revoke all active sessions for this user
      await this.sessionRepo.revokeAllUserSessions(userId);
    }

    return {
      success: true,
      message: 'تم تسجيل الخروج بنجاح',
    };
  }

  /**
   * Retrieve current authenticated user profile.
   */
  async getMe(userId: string): Promise<UserProfileDto> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new AppException(
        AppErrorCode.NOT_FOUND,
        'المستخدم المطلوب غير موجود في النظام',
      );
    }

    return this.mapToProfile(user);
  }

  /**
   * Internal helper to issue access and refresh tokens and record the session.
   */
  private async issueTokenBundle(
    user: User,
    devicePlatform: string,
    manager?: any,
  ): Promise<TokenBundleDto> {
    const familyId = crypto.randomUUID();

    const accessToken = signAccessToken({
      sub: user.id,
      isGuest: user.isGuest,
    });

    const refreshToken = signRefreshToken({
      sub: user.id,
      isGuest: user.isGuest,
      familyId,
    });

    const sessionData = {
      userId: user.id,
      familyId,
      refreshTokenHash: hashToken(refreshToken),
      devicePlatform: devicePlatform.slice(0, 32),
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + getJwtRefreshExpiresIn() * 1000),
      rotatedAt: null,
      revokedAt: null,
    };

    if (manager) {
      const session = manager.create(AuthSession, sessionData);
      await manager.save(AuthSession, session);
    } else {
      await this.sessionRepo.create(sessionData);
    }

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: getJwtAccessExpiresIn(),
    };
  }

  /**
   * Safe mapping from entity to public user profile.
   */
  private mapToProfile(user: User): UserProfileDto {
    return {
      id: user.id,
      isGuest: user.isGuest,
      preferredLanguage: user.preferredLanguage,
      createdAt: user.createdAt
        ? user.createdAt.toISOString()
        : new Date().toISOString(),
      updatedAt: user.updatedAt
        ? user.updatedAt.toISOString()
        : new Date().toISOString(),
    };
  }
}
