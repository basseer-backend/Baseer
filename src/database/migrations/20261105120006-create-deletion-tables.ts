import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDeletionTables20261105120006 implements MigrationInterface {
  name = 'CreateDeletionTables20261105120006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE deletion_requests (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          user_id uuid,
          status varchar(16) NOT NULL DEFAULT 'ACCEPTED',
          deletion_method varchar(20) NOT NULL,
          idempotency_key_hash char(64) NOT NULL,
          capability_hash char(64) NOT NULL,
          stage_status jsonb NOT NULL DEFAULT '{}'::jsonb,
          failure_code varchar(64),
          accepted_at timestamptz NOT NULL DEFAULT now(),
          completed_at timestamptz,
          CONSTRAINT pk_deletion_requests PRIMARY KEY (id),
          CONSTRAINT fk_deletion_requests_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
          CONSTRAINT uq_deletion_requests_idempotency_key_hash UNIQUE (idempotency_key_hash),
          CONSTRAINT ck_deletion_requests_status CHECK (status IN ('ACCEPTED', 'PROCESSING', 'COMPLETED', 'FAILED')),
          CONSTRAINT ck_deletion_requests_method CHECK (deletion_method IN ('online', 'offline_tombstone')),
          CONSTRAINT ck_deletion_requests_idempotency_format CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
          CONSTRAINT ck_deletion_requests_capability_format CHECK (capability_hash ~ '^[0-9a-f]{64}$'),
          CONSTRAINT ck_deletion_requests_stage_status CHECK (jsonb_typeof(stage_status) = 'object'),
          CONSTRAINT ck_deletion_requests_failure CHECK (status <> 'FAILED' OR failure_code IS NOT NULL),
          CONSTRAINT ck_deletion_requests_completion CHECK (
              (status = 'COMPLETED' AND completed_at IS NOT NULL AND completed_at >= accepted_at)
              OR (status <> 'COMPLETED' AND completed_at IS NULL)
          )
      );
    `);

    await queryRunner.query(`
      CREATE TABLE deletion_audit_events (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          deletion_request_id uuid NOT NULL,
          event_status varchar(16) NOT NULL,
          anonymized_user_hash char(64) NOT NULL,
          hmac_key_version smallint NOT NULL,
          occurred_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_deletion_audit_events PRIMARY KEY (id),
          CONSTRAINT fk_deletion_audit_events_request FOREIGN KEY (deletion_request_id) REFERENCES deletion_requests (id) ON DELETE CASCADE,
          CONSTRAINT ck_deletion_audit_events_status CHECK (event_status IN ('ACCEPTED', 'PROCESSING', 'COMPLETED', 'FAILED')),
          CONSTRAINT ck_deletion_audit_events_hash_format CHECK (anonymized_user_hash ~ '^[0-9a-f]{64}$'),
          CONSTRAINT ck_deletion_audit_events_key_version CHECK (hmac_key_version > 0)
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE deletion_audit_events;`);
    await queryRunner.query(`DROP TABLE deletion_requests;`);
  }
}
