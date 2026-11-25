import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeletionWorkerLeasing20261122120001
  implements MigrationInterface
{
  name = 'AddDeletionWorkerLeasing20261122120001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE deletion_requests
          ADD COLUMN IF NOT EXISTS locked_by varchar(64),
          ADD COLUMN IF NOT EXISTS locked_at timestamptz,
          ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
          ADD COLUMN IF NOT EXISTS attempt_count smallint NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS max_attempts smallint NOT NULL DEFAULT 3,
          ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_deletion_requests_worker_queue
          ON deletion_requests (status, next_retry_at, lease_expires_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS ix_deletion_requests_worker_queue;
    `);

    await queryRunner.query(`
      ALTER TABLE deletion_requests
          DROP COLUMN IF EXISTS next_retry_at,
          DROP COLUMN IF EXISTS max_attempts,
          DROP COLUMN IF EXISTS attempt_count,
          DROP COLUMN IF EXISTS lease_expires_at,
          DROP COLUMN IF EXISTS locked_at,
          DROP COLUMN IF EXISTS locked_by;
    `);
  }
}
