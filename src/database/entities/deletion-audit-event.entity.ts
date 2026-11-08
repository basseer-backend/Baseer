import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { DeletionRequest } from './deletion-request.entity';

@Entity({ name: 'deletion_audit_events' })
@Check(
  'ck_deletion_audit_events_status',
  `"event_status" IN ('ACCEPTED', 'PROCESSING', 'COMPLETED', 'FAILED')`,
)
@Check(
  'ck_deletion_audit_events_hash_format',
  `"anonymized_user_hash" ~ '^[0-9a-f]{64}$'`,
)
@Check(
  'ck_deletion_audit_events_key_version',
  `"hmac_key_version" > 0`,
)
export class DeletionAuditEvent {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_deletion_audit_events',
    default: () => 'gen_random_uuid()',
  })
  id: string;

  @Column({ name: 'deletion_request_id', type: 'uuid' })
  deletionRequestId: string;

  @ManyToOne(() => DeletionRequest, (deletionRequest) => deletionRequest.auditEvents, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'deletion_request_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_deletion_audit_events_request',
  })
  deletionRequest: DeletionRequest;

  @Column({ name: 'event_status', type: 'varchar', length: 16 })
  eventStatus: string;

  @Column({ name: 'anonymized_user_hash', type: 'char', length: 64 })
  anonymizedUserHash: string;

  @Column({ name: 'hmac_key_version', type: 'smallint' })
  hmacKeyVersion: number;

  @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'now()' })
  occurredAt: Date;
}
