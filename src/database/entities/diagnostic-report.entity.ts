import { Check, Column, Entity, PrimaryColumn, Unique } from 'typeorm';

@Entity({ name: 'diagnostic_reports' })
@Unique('uq_diagnostic_reports_object_key', ['objectKey'])
@Check('ck_diagnostic_reports_size', `"size_bytes" > 0`)
@Check('ck_diagnostic_reports_expiry', `"expires_at" > "created_at"`)
export class DiagnosticReport {
  @PrimaryColumn({
    name: 'id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_diagnostic_reports',
    default: () => 'gen_random_uuid()',
  })
  id: string;

  @Column({ name: 'object_key', type: 'text' })
  objectKey: string;

  @Column({ name: 'app_version', type: 'varchar', length: 32 })
  appVersion: string;

  @Column({ name: 'size_bytes', type: 'integer' })
  sizeBytes: number;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;
}
