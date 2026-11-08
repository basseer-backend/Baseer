import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTriggersAndFunctions20261105120009
  implements MigrationInterface
{
  name = 'CreateTriggersAndFunctions20261105120009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TRIGGER trg_users_set_updated_at
          BEFORE UPDATE ON users
          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_user_preferences_set_updated_at
          BEFORE UPDATE ON user_preferences
          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_task_executions_status_transition
          BEFORE UPDATE OF status ON task_executions
          FOR EACH ROW EXECUTE FUNCTION enforce_task_status_transition();
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_task_model_runs_status_transition
          BEFORE UPDATE OF status ON task_model_runs
          FOR EACH ROW EXECUTE FUNCTION enforce_task_status_transition();
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_deletion_requests_status_transition
          BEFORE UPDATE OF status ON deletion_requests
          FOR EACH ROW EXECUTE FUNCTION enforce_deletion_status_transition();
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_deletion_audit_events_immutable
          BEFORE UPDATE ON deletion_audit_events
          FOR EACH ROW EXECUTE FUNCTION reject_row_update();
    `);

    await queryRunner.query(`
      CREATE FUNCTION revoke_auth_session_family(p_family_id uuid)
      RETURNS integer
      LANGUAGE plpgsql
      AS $$
      DECLARE
          affected integer;
      BEGIN
          UPDATE auth_sessions
          SET revoked_at = now()
          WHERE family_id = p_family_id
            AND revoked_at IS NULL;

          GET DIAGNOSTICS affected = ROW_COUNT;
          RETURN affected;
      END;
      $$;
    `);

    await queryRunner.query(`
      CREATE FUNCTION purge_expired_auth_sessions(p_grace interval DEFAULT interval '0 seconds')
      RETURNS integer
      LANGUAGE plpgsql
      AS $$
      DECLARE
          affected integer;
      BEGIN
          DELETE FROM auth_sessions
          WHERE expires_at < now() - p_grace;

          GET DIAGNOSTICS affected = ROW_COUNT;
          RETURN affected;
      END;
      $$;
    `);

    await queryRunner.query(`
      CREATE FUNCTION purge_expired_deletion_tokens(p_grace interval DEFAULT interval '0 seconds')
      RETURNS integer
      LANGUAGE plpgsql
      AS $$
      DECLARE
          affected integer;
      BEGIN
          DELETE FROM deletion_tokens
          WHERE expires_at < now() - p_grace;

          GET DIAGNOSTICS affected = ROW_COUNT;
          RETURN affected;
      END;
      $$;
    `);

    await queryRunner.query(`
      CREATE FUNCTION purge_expired_diagnostic_reports()
      RETURNS SETOF text
      LANGUAGE sql
      AS $$
          DELETE FROM diagnostic_reports
          WHERE expires_at <= now()
          RETURNING object_key;
      $$;
    `);

    await queryRunner.query(`
      CREATE FUNCTION complete_account_deletion(
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS complete_account_deletion(uuid, char(64), smallint);`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS purge_expired_diagnostic_reports();`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS purge_expired_deletion_tokens(interval);`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS purge_expired_auth_sessions(interval);`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS revoke_auth_session_family(uuid);`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_deletion_audit_events_immutable ON deletion_audit_events;`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_deletion_requests_status_transition ON deletion_requests;`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_task_model_runs_status_transition ON task_model_runs;`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_task_executions_status_transition ON task_executions;`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_user_preferences_set_updated_at ON user_preferences;`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_users_set_updated_at ON users;`,
    );
  }
}
