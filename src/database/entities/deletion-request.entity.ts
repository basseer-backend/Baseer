import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { DeletionAuditEvent } from './deletion-audit-event.entity';
import { User } from './user.entity';

@Entity({ name: 'deletion_requests' })
@Unique('uq_deletion_requests_idempotency_key_hash', ['idempotencyKeyHash'])
@Check(
  'ck_deletion_requests_status',
  `"status" IN ('ACCEPTED', 'PROCESSING', 'COMPLETED', 'FAILED')`,
)
@Check(
  'ck_deletion_requests_method',
  `"deletion_method" IN ('online', 'offline_tombstone')`,
)
@Check(
  'ck_deletion_requests_idempotency_format',
  `"idempotency_key_hash" ~ '^[0-9a-f]{64}$'`,
)
@Check(
  'ck_deletion_requests_capability_format',
  `"capability_hash" ~ '^[0-9a-f]{64}$'`,
)
@Check(
  'ck_deletion_requests_stage_status',
  `jsonb_typeof("stage_status") = 'object'`,
)
@Check(
  'ck_deletion_requests_failure',
  `"status" <> 'FAILED' OR "failure_code" IS NOT NULL`,
)
@Check(
  'ck_deletion_requests_completion',
  `("status" = 'COMPLETED' AND "completed_at" IS NOT NULL AND "completed_at" >= "accepted_at") OR ("status" <> 'COMPLETED' AND "completed_at" IS NULL)`,
)
export class DeletionRequest {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_deletion_requests',
    default: () => 'gen_random_uuid()',
  })
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, (user) => user.deletionRequests, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'user_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_deletion_requests_user',
  })
  user: User | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 16,
    default: 'ACCEPTED',
  })
  status: string;

  @Column({ name: 'deletion_method', type: 'varchar', length: 20 })
  deletionMethod: string;

  @Column({ name: 'idempotency_key_hash', type: 'char', length: 64 })
  idempotencyKeyHash: string;

  @Column({ name: 'capability_hash', type: 'char', length: 64 })
  capabilityHash: string;

  @Column({
    name: 'stage_status',
    type: 'jsonb',
    default: () => `'{}'::jsonb`,
  })
  stageStatus: Record<string, unknown>;

  @Column({ name: 'failure_code', type: 'varchar', length: 64, nullable: true })
  failureCode: string | null;

  @Column({ name: 'accepted_at', type: 'timestamptz', default: () => 'now()' })
  acceptedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @OneToMany(
    () => DeletionAuditEvent,
    (auditEvent) => auditEvent.deletionRequest,
  )
  auditEvents: DeletionAuditEvent[];
}
