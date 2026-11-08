import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { User } from './user.entity';

@Entity({ name: 'auth_sessions' })
@Unique('uq_auth_sessions_refresh_token_hash', ['refreshTokenHash'])
@Check(
  'ck_auth_sessions_hash_format',
  `"refresh_token_hash" ~ '^[0-9a-f]{64}$'`,
)
@Check(
  'ck_auth_sessions_platform',
  `char_length("device_platform") > 0`,
)
@Check('ck_auth_sessions_expiry', `"expires_at" > "issued_at"`)
@Check(
  'ck_auth_sessions_rotated',
  `"rotated_at" IS NULL OR "rotated_at" >= "issued_at"`,
)
@Check(
  'ck_auth_sessions_revoked',
  `"revoked_at" IS NULL OR "revoked_at" >= "issued_at"`,
)
export class AuthSession {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_auth_sessions',
    default: () => 'gen_random_uuid()',
  })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, (user) => user.authSessions, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_auth_sessions_user',
  })
  user: User;

  @Column({ name: 'family_id', type: 'uuid' })
  familyId: string;

  @Column({ name: 'refresh_token_hash', type: 'char', length: 64 })
  refreshTokenHash: string;

  @Column({ name: 'device_platform', type: 'varchar', length: 32 })
  devicePlatform: string;

  @Column({ name: 'issued_at', type: 'timestamptz', default: () => 'now()' })
  issuedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'rotated_at', type: 'timestamptz', nullable: true })
  rotatedAt: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
