import { MigrationInterface, QueryRunner } from 'typeorm';

export class FencingCompleteAccountDeletion20261122140001
  implements MigrationInterface
{
  name = 'FencingCompleteAccountDeletion20261122140001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop legacy unfenced 3-argument function to eliminate unsafe purge path
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS complete_account_deletion(uuid, char(64), smallint);
    `);

    // 2. Create fenced 4-argument function validating locked_by and strict lease validity using database clock
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION complete_account_deletion(
          p_request_id uuid,
          p_anonymized_user_hash char(64),
          p_hmac_key_version smallint,
          p_locked_by varchar(64)
      )
      RETURNS void
      LANGUAGE plpgsql
      AS $$
      DECLARE
          v_user_id uuid;
          v_lease_expires_at timestamptz;
      BEGIN
          -- Obtain the row lock and retrieve lease info
          SELECT user_id, lease_expires_at
          INTO v_user_id, v_lease_expires_at
          FROM deletion_requests
          WHERE id = p_request_id
            AND status = 'PROCESSING'
            AND locked_by = p_locked_by
          FOR UPDATE;

          IF NOT FOUND THEN
              RAISE EXCEPTION 'deletion request % is not in processing state or caller % does not hold lock', p_request_id, p_locked_by
                  USING ERRCODE = 'check_violation';
          END IF;

          -- Strictly validate lease after acquiring lock using actual database clock
          IF v_lease_expires_at IS NULL OR v_lease_expires_at <= clock_timestamp() THEN
              RAISE EXCEPTION 'lease for deletion request % has expired (lease_expires_at: %, clock: %)', p_request_id, v_lease_expires_at, clock_timestamp()
                  USING ERRCODE = 'check_violation';
          END IF;

          UPDATE deletion_requests
          SET status = 'COMPLETED',
              completed_at = clock_timestamp(),
              locked_by = NULL,
              locked_at = NULL,
              lease_expires_at = NULL
          WHERE id = p_request_id;

          INSERT INTO deletion_audit_events (deletion_request_id, event_status, anonymized_user_hash, hmac_key_version, occurred_at)
          VALUES (p_request_id, 'COMPLETED', p_anonymized_user_hash, p_hmac_key_version, clock_timestamp());

          IF v_user_id IS NOT NULL THEN
              DELETE FROM users WHERE id = v_user_id;
          END IF;
      END;
      $$;
    `);

    // 3. Preserve project's existing least-privilege permission model: revoke PUBLIC, grant to blind_assistant_app
    await queryRunner.query(`
      REVOKE ALL ON FUNCTION
          complete_account_deletion(uuid, char(64), smallint, varchar(64))
      FROM PUBLIC;
    `);

    await queryRunner.query(`
      GRANT EXECUTE ON FUNCTION
          complete_account_deletion(uuid, char(64), smallint, varchar(64))
      TO blind_assistant_app;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS complete_account_deletion(uuid, char(64), smallint, varchar(64));
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION complete_account_deletion(
          p_request_id uuid,
          p_anonymized_user_hash char(64),
          p_hmac_key_version smallint
      )
      RETURNS void
      LANGUAGE plpgsql
      AS $$
      DECLARE
          v_user_id uuid;
      BEGIN
          SELECT user_id
          INTO v_user_id
          FROM deletion_requests
          WHERE id = p_request_id
            AND status = 'PROCESSING'
          FOR UPDATE;

          IF NOT FOUND THEN
              RAISE EXCEPTION 'deletion request % is not in processing state', p_request_id
                  USING ERRCODE = 'no_data_found';
          END IF;

          UPDATE deletion_requests
          SET status = 'COMPLETED',
              completed_at = now()
          WHERE id = p_request_id;

          INSERT INTO deletion_audit_events (deletion_request_id, event_status, anonymized_user_hash, hmac_key_version)
          VALUES (p_request_id, 'COMPLETED', p_anonymized_user_hash, p_hmac_key_version);

          IF v_user_id IS NOT NULL THEN
              DELETE FROM users WHERE id = v_user_id;
          END IF;
      END;
      $$;
    `);

    // Restore least-privilege permissions for 3-argument function matching 20261105120010
    await queryRunner.query(`
      REVOKE ALL ON FUNCTION
          complete_account_deletion(uuid, char(64), smallint)
      FROM PUBLIC;
    `);

    await queryRunner.query(`
      GRANT EXECUTE ON FUNCTION
          complete_account_deletion(uuid, char(64), smallint)
      TO blind_assistant_app;
    `);
  }
}
