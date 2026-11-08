import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIndexes20261105120008 implements MigrationInterface {
  name = 'CreateIndexes20261105120008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX ix_auth_sessions_user_id ON auth_sessions (user_id);`,
    );
    await queryRunner.query(
      `CREATE INDEX ix_auth_sessions_family_id ON auth_sessions (family_id);`,
    );
    await queryRunner.query(
      `CREATE INDEX ix_auth_sessions_expires_at ON auth_sessions (expires_at);`,
    );
    await queryRunner.query(
      `CREATE INDEX ix_deletion_tokens_user_id ON deletion_tokens (user_id);`,
    );
    await queryRunner.query(
      `CREATE INDEX ix_deletion_tokens_expires_at ON deletion_tokens (expires_at);`,
    );
    await queryRunner.query(
      `CREATE INDEX ix_saved_locations_user_created ON saved_locations (user_id, created_at DESC);`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_ai_model_versions_active_target
          ON ai_model_versions (model_id, deployment_target)
          WHERE status = 'active';
    `);
    await queryRunner.query(`
      CREATE INDEX ix_ai_model_versions_rollback_target
          ON ai_model_versions (rollback_target_version_id)
          WHERE rollback_target_version_id IS NOT NULL;
    `);
    await queryRunner.query(
      `CREATE INDEX ix_task_executions_user_created ON task_executions (user_id, created_at DESC);`,
    );
    await queryRunner.query(
      `CREATE INDEX ix_task_executions_request_id ON task_executions (request_id);`,
    );
    await queryRunner.query(`
      CREATE INDEX ix_task_executions_open
          ON task_executions (created_at)
          WHERE status IN ('PENDING', 'PROCESSING');
    `);
    await queryRunner.query(
      `CREATE INDEX ix_task_executions_created_at ON task_executions (created_at);`,
    );
    await queryRunner.query(
      `CREATE INDEX ix_task_model_runs_task ON task_model_runs (task_execution_id);`,
    );
    await queryRunner.query(
      `CREATE INDEX ix_task_model_runs_model_version ON task_model_runs (model_version_id, created_at DESC);`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_task_model_runs_primary
          ON task_model_runs (task_execution_id)
          WHERE run_role = 'primary';
    `);
    await queryRunner.query(`
      CREATE INDEX ix_deletion_requests_user_id
          ON deletion_requests (user_id)
          WHERE user_id IS NOT NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX ix_deletion_requests_open
          ON deletion_requests (accepted_at)
          WHERE status IN ('ACCEPTED', 'PROCESSING');
    `);
    await queryRunner.query(
      `CREATE INDEX ix_deletion_audit_events_request ON deletion_audit_events (deletion_request_id, occurred_at);`,
    );
    await queryRunner.query(
      `CREATE INDEX ix_diagnostic_reports_expires_at ON diagnostic_reports (expires_at);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const indexes = [
      'ix_diagnostic_reports_expires_at',
      'ix_deletion_audit_events_request',
      'ix_deletion_requests_open',
      'ix_deletion_requests_user_id',
      'uq_task_model_runs_primary',
      'ix_task_model_runs_model_version',
      'ix_task_model_runs_task',
      'ix_task_executions_created_at',
      'ix_task_executions_open',
      'ix_task_executions_request_id',
      'ix_task_executions_user_created',
      'ix_ai_model_versions_rollback_target',
      'uq_ai_model_versions_active_target',
      'ix_saved_locations_user_created',
      'ix_deletion_tokens_expires_at',
      'ix_deletion_tokens_user_id',
      'ix_auth_sessions_expires_at',
      'ix_auth_sessions_family_id',
      'ix_auth_sessions_user_id',
    ];

    for (const indexName of indexes) {
      await queryRunner.query(`DROP INDEX ${indexName};`);
    }
  }
}
