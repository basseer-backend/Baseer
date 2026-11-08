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

@Entity({ name: 'deletion_tokens' })
@Unique('uq_deletion_tokens_token_hash', ['tokenHash'])
@Check('ck_deletion_tokens_hash_format', `"token_hash" ~ '^[0-9a-f]{64}$'`)
@Check('ck_deletion_tokens_expiry', `"expires_at" > "created_at"`)
@Check(
  'ck_deletion_tokens_consumed',
  `"consumed_at" IS NULL OR "consumed_at" >= "created_at"`,
)
export class DeletionToken {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_deletion_tokens',
    default: () => 'gen_random_uuid()',
  })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, (user) => user.deletionTokens, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_deletion_tokens_user',
  })
  user: User;

  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt: Date | null;
}
