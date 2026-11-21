import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { AuthSession } from '../entities/auth-session.entity';
import { DatabaseRepository } from './db.repository';

@Injectable()
export class AuthSessionRepository extends DatabaseRepository<AuthSession> {
  constructor(
    @InjectRepository(AuthSession)
    protected readonly model: Repository<AuthSession>,
  ) {
    super(model);
  }

  /**
   * Find an auth session by its refresh token hash (64 hex characters).
   */
  async findByRefreshTokenHash(
    refreshTokenHash: string,
  ): Promise<AuthSession | null> {
    return this.model.findOne({
      where: { refreshTokenHash },
      relations: ['user'],
    });
  }

  /**
   * Revoke all sessions within a token family (used upon reuse detection).
   */
  async revokeFamily(familyId: string): Promise<void> {
    await this.model
      .createQueryBuilder()
      .update(AuthSession)
      .set({ revokedAt: new Date() })
      .where('familyId = :familyId AND revokedAt IS NULL', { familyId })
      .execute();
  }

  /**
   * Revoke a single session by its session ID.
   */
  async revokeSession(id: string): Promise<void> {
    await this.model.update(id, { revokedAt: new Date() });
  }

  /**
   * Revoke all active sessions for a user.
   */
  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.model
      .createQueryBuilder()
      .update(AuthSession)
      .set({ revokedAt: new Date() })
      .where('userId = :userId AND revokedAt IS NULL', { userId })
      .execute();
  }

  /**
   * Find all active (non-expired, non-revoked) sessions for a user.
   */
  async findActiveSessionsByUserId(userId: string): Promise<AuthSession[]> {
    const now = new Date();
    return this.model.find({
      where: {
        userId,
        revokedAt: IsNull(),
        expiresAt: MoreThan(now),
      },
      order: { issuedAt: 'DESC' },
    });
  }
}
