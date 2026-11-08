import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creating blind_assistant_app requires a PostgreSQL role with CREATEROLE.
 * The migration stops with an explicit error when the current user cannot
 * create the role. Rollback revokes the grants from this migration and
 * restores PUBLIC execution. The role itself is not dropped, because it may
 * have existed before the migration or may still be referenced elsewhere.
 *
 * Function grants use char(64), which is the declared argument type of
 * complete_account_deletion. PostgreSQL does not resolve an unqualified
 * char argument to character(64).
 */
export class PermissionsAndComments20261105120010 implements MigrationInterface {
  name = 'PermissionsAndComments20261105120010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $do$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'blind_assistant_app') THEN
              BEGIN
                  CREATE ROLE blind_assistant_app NOLOGIN;
              EXCEPTION
                  WHEN insufficient_privilege THEN
                      RAISE EXCEPTION 'Administrative step required: current user % cannot create role blind_assistant_app. Connect as a PostgreSQL role with CREATEROLE, create that NOLOGIN role, then run this migration again.', current_user;
              END;
          END IF;
      END
      $do$;
    `);

    await queryRunner.query(`
      GRANT SELECT, INSERT, UPDATE, DELETE ON
          users,
          auth_sessions,
          deletion_tokens,
          user_preferences,
          saved_locations,
          task_executions,
          task_model_runs,
          deletion_requests,
          diagnostic_reports
      TO blind_assistant_app;
    `);
    await queryRunner.query(
      `GRANT SELECT, INSERT ON deletion_audit_events TO blind_assistant_app;`,
    );
    await queryRunner.query(
      `GRANT SELECT ON ai_models, ai_model_versions TO blind_assistant_app;`,
    );
    await queryRunner.query(`
      REVOKE ALL ON FUNCTION
          revoke_auth_session_family(uuid),
          purge_expired_auth_sessions(interval),
          purge_expired_deletion_tokens(interval),
          purge_expired_diagnostic_reports(),
          complete_account_deletion(uuid, char(64), smallint)
      FROM PUBLIC;
    `);
    await queryRunner.query(`
      GRANT EXECUTE ON FUNCTION
          revoke_auth_session_family(uuid),
          purge_expired_auth_sessions(interval),
          purge_expired_deletion_tokens(interval),
          purge_expired_diagnostic_reports(),
          complete_account_deletion(uuid, char(64), smallint)
      TO blind_assistant_app;
    `);

    await this.applyComments(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.clearComments(queryRunner);
    await queryRunner.query(`
      DO $do$
      BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'blind_assistant_app') THEN
              REVOKE ALL ON TABLE
                  users,
                  auth_sessions,
                  deletion_tokens,
                  user_preferences,
                  saved_locations,
                  task_executions,
                  task_model_runs,
                  deletion_requests,
                  diagnostic_reports,
                  deletion_audit_events,
                  ai_models,
                  ai_model_versions
              FROM blind_assistant_app;

              REVOKE ALL ON FUNCTION
                  revoke_auth_session_family(uuid),
                  purge_expired_auth_sessions(interval),
                  purge_expired_deletion_tokens(interval),
                  purge_expired_diagnostic_reports(),
                  complete_account_deletion(uuid, char(64), smallint)
              FROM blind_assistant_app;
          END IF;
      END
      $do$;
    `);
    await queryRunner.query(`
      GRANT EXECUTE ON FUNCTION
          revoke_auth_session_family(uuid),
          purge_expired_auth_sessions(interval),
          purge_expired_deletion_tokens(interval),
          purge_expired_diagnostic_reports(),
          complete_account_deletion(uuid, char(64), smallint)
      TO PUBLIC;
    `);
  }

  private async applyComments(queryRunner: QueryRunner): Promise<void> {
    const statements = [
      `COMMENT ON TABLE users IS 'Application users including anonymous guests with no personal data'`,
      `COMMENT ON COLUMN users.id IS 'Unique identifier of the user'`,
      `COMMENT ON COLUMN users.is_guest IS 'True when the user has an anonymous guest session'`,
      `COMMENT ON COLUMN users.preferred_language IS 'Interface and speech language with two allowed values for Egyptian Arabic and American English'`,
      `COMMENT ON COLUMN users.created_at IS 'Time the user record was created'`,
      `COMMENT ON COLUMN users.updated_at IS 'Time the user record last changed'`,
      `COMMENT ON TABLE auth_sessions IS 'Refresh token sessions grouped in rotation families so reuse of an old token can revoke the whole family'`,
      `COMMENT ON COLUMN auth_sessions.id IS 'Unique identifier of the session'`,
      `COMMENT ON COLUMN auth_sessions.user_id IS 'Owner of the session'`,
      `COMMENT ON COLUMN auth_sessions.family_id IS 'Shared by every token issued from one login through rotation'`,
      `COMMENT ON COLUMN auth_sessions.refresh_token_hash IS 'Sha256 hash in lowercase hex of the refresh token and never the token itself'`,
      `COMMENT ON COLUMN auth_sessions.device_platform IS 'Platform of the device that owns the session'`,
      `COMMENT ON COLUMN auth_sessions.issued_at IS 'Time the refresh token was issued'`,
      `COMMENT ON COLUMN auth_sessions.expires_at IS 'Time after which the refresh token is no longer valid'`,
      `COMMENT ON COLUMN auth_sessions.rotated_at IS 'Time the token was exchanged for a new one'`,
      `COMMENT ON COLUMN auth_sessions.revoked_at IS 'Time the session was revoked'`,
      `COMMENT ON TABLE deletion_tokens IS 'Single purpose tokens that can only be used to request account deletion and check its status'`,
      `COMMENT ON COLUMN deletion_tokens.id IS 'Unique identifier of the token record'`,
      `COMMENT ON COLUMN deletion_tokens.user_id IS 'User the token belongs to'`,
      `COMMENT ON COLUMN deletion_tokens.token_hash IS 'Sha256 hash in lowercase hex of the delete only token'`,
      `COMMENT ON COLUMN deletion_tokens.created_at IS 'Time the token was created'`,
      `COMMENT ON COLUMN deletion_tokens.expires_at IS 'Time after which the token is no longer valid'`,
      `COMMENT ON COLUMN deletion_tokens.consumed_at IS 'Time the token was used'`,
      `COMMENT ON TABLE user_preferences IS 'Accessibility settings and consent choices of one user'`,
      `COMMENT ON COLUMN user_preferences.user_id IS 'User that owns the preferences'`,
      `COMMENT ON COLUMN user_preferences.speech_rate IS 'Speech speed multiplier where one is normal speed'`,
      `COMMENT ON COLUMN user_preferences.high_contrast_enabled IS 'True when the high contrast display is on'`,
      `COMMENT ON COLUMN user_preferences.haptic_enabled IS 'True when vibration feedback is on'`,
      `COMMENT ON COLUMN user_preferences.haptic_intensity IS 'Vibration strength with three allowed values low medium and high'`,
      `COMMENT ON COLUMN user_preferences.voice_wake_word_enabled IS 'True when the voice wake word is on'`,
      `COMMENT ON COLUMN user_preferences.cloud_ai_consent IS 'True when the user agreed to send data to cloud AI features'`,
      `COMMENT ON COLUMN user_preferences.diagnostic_analytics_consent IS 'True when the user agreed to send anonymous diagnostic reports'`,
      `COMMENT ON COLUMN user_preferences.consent_policy_version IS 'Version of the privacy policy the user agreed to'`,
      `COMMENT ON COLUMN user_preferences.consent_updated_at IS 'Time the consent choices last changed'`,
      `COMMENT ON COLUMN user_preferences.updated_at IS 'Time the preferences last changed'`,
      `COMMENT ON TABLE saved_locations IS 'Places the user chose to save and only when the user asks'`,
      `COMMENT ON COLUMN saved_locations.id IS 'Unique identifier of the saved place'`,
      `COMMENT ON COLUMN saved_locations.user_id IS 'User that owns the saved place'`,
      `COMMENT ON COLUMN saved_locations.custom_label IS 'Name the user gave to the place'`,
      `COMMENT ON COLUMN saved_locations.latitude IS 'Latitude in decimal degrees'`,
      `COMMENT ON COLUMN saved_locations.longitude IS 'Longitude in decimal degrees'`,
      `COMMENT ON COLUMN saved_locations.created_at IS 'Time the place was saved'`,
      `COMMENT ON TABLE ai_models IS 'Catalogue of AI models and this is not user data so account deletion never removes it'`,
      `COMMENT ON COLUMN ai_models.id IS 'Unique identifier of the model'`,
      `COMMENT ON COLUMN ai_models.model_key IS 'Stable unique key used in code to refer to the model'`,
      `COMMENT ON COLUMN ai_models.display_name IS 'Readable name of the model'`,
      `COMMENT ON COLUMN ai_models.task_family IS 'Group of tasks the model serves'`,
      `COMMENT ON COLUMN ai_models.created_at IS 'Time the model was added to the catalogue'`,
      `COMMENT ON TABLE ai_model_versions IS 'Versions of each AI model with integrity hash licence and rollback target'`,
      `COMMENT ON COLUMN ai_model_versions.id IS 'Unique identifier of the model version'`,
      `COMMENT ON COLUMN ai_model_versions.model_id IS 'Model this version belongs to'`,
      `COMMENT ON COLUMN ai_model_versions.version IS 'Version label that is unique for each model'`,
      `COMMENT ON COLUMN ai_model_versions.artifact_sha256 IS 'Sha256 hash in lowercase hex of the model file'`,
      `COMMENT ON COLUMN ai_model_versions.artifact_uri IS 'Location of the model file'`,
      `COMMENT ON COLUMN ai_model_versions.runtime IS 'Inference runtime that loads the model'`,
      `COMMENT ON COLUMN ai_model_versions.deployment_target IS 'Where the model runs which is cloud or mobile'`,
      `COMMENT ON COLUMN ai_model_versions.license IS 'Licence that covers the model'`,
      `COMMENT ON COLUMN ai_model_versions.model_card_uri IS 'Location of the model card'`,
      `COMMENT ON COLUMN ai_model_versions.rollback_target_version_id IS 'Earlier version of the same model to return to when this version must be rolled back'`,
      `COMMENT ON COLUMN ai_model_versions.status IS 'Lifecycle state with values draft approved active deprecated and retired'`,
      `COMMENT ON COLUMN ai_model_versions.created_at IS 'Time the version was added to the catalogue'`,
      `COMMENT ON TABLE task_executions IS 'Metadata of cloud tasks and never the media transcripts or extracted text'`,
      `COMMENT ON COLUMN task_executions.id IS 'Unique identifier of the task'`,
      `COMMENT ON COLUMN task_executions.user_id IS 'User that started the task'`,
      `COMMENT ON COLUMN task_executions.request_id IS 'Value of the request id header sent by the client'`,
      `COMMENT ON COLUMN task_executions.client_task_id IS 'Task id created by the client and unique for each user'`,
      `COMMENT ON COLUMN task_executions.task_type IS 'Kind of task such as scene description or document reading'`,
      `COMMENT ON COLUMN task_executions.status IS 'Task state with values PENDING PROCESSING COMPLETED FAILED and CANCELLED'`,
      `COMMENT ON COLUMN task_executions.processing_time_ms IS 'Total processing time in milliseconds'`,
      `COMMENT ON COLUMN task_executions.error_code IS 'Stable machine readable error code when the task failed'`,
      `COMMENT ON COLUMN task_executions.created_at IS 'Time the task was created'`,
      `COMMENT ON COLUMN task_executions.completed_at IS 'Time the task reached a final state'`,
      `COMMENT ON TABLE task_model_runs IS 'Model runs that belong to a task including fallback runs'`,
      `COMMENT ON COLUMN task_model_runs.id IS 'Unique identifier of the run'`,
      `COMMENT ON COLUMN task_model_runs.task_execution_id IS 'Task the run belongs to'`,
      `COMMENT ON COLUMN task_model_runs.model_version_id IS 'Model version that was used'`,
      `COMMENT ON COLUMN task_model_runs.run_role IS 'Role of the run which is primary or fallback and each task has at most one primary run'`,
      `COMMENT ON COLUMN task_model_runs.status IS 'Run state with values PENDING PROCESSING COMPLETED FAILED and CANCELLED'`,
      `COMMENT ON COLUMN task_model_runs.processing_time_ms IS 'Processing time of the run in milliseconds'`,
      `COMMENT ON COLUMN task_model_runs.confidence IS 'Model confidence between zero and one and it is not calibrated unless measured'`,
      `COMMENT ON COLUMN task_model_runs.error_code IS 'Stable machine readable error code when the run failed'`,
      `COMMENT ON COLUMN task_model_runs.created_at IS 'Time the run was created'`,
      `COMMENT ON COLUMN task_model_runs.completed_at IS 'Time the run reached a final state'`,
      `COMMENT ON TABLE deletion_requests IS 'Account deletion workflow state that stays after the user is removed'`,
      `COMMENT ON COLUMN deletion_requests.id IS 'Request id that is also the deletion receipt id'`,
      `COMMENT ON COLUMN deletion_requests.user_id IS 'User being deleted and it becomes empty after the purge'`,
      `COMMENT ON COLUMN deletion_requests.status IS 'Workflow state with values ACCEPTED PROCESSING COMPLETED and FAILED'`,
      `COMMENT ON COLUMN deletion_requests.deletion_method IS 'How the request arrived either online or by replaying an offline tombstone'`,
      `COMMENT ON COLUMN deletion_requests.idempotency_key_hash IS 'Sha256 hash in lowercase hex of the idempotency key'`,
      `COMMENT ON COLUMN deletion_requests.capability_hash IS 'Sha256 hash in lowercase hex of the token that allows status polling'`,
      `COMMENT ON COLUMN deletion_requests.stage_status IS 'Progress of each deletion stage stored as a json object'`,
      `COMMENT ON COLUMN deletion_requests.failure_code IS 'Stable machine readable code that explains why the request failed'`,
      `COMMENT ON COLUMN deletion_requests.accepted_at IS 'Time the request was accepted'`,
      `COMMENT ON COLUMN deletion_requests.completed_at IS 'Time the request was completed'`,
      `COMMENT ON TABLE deletion_audit_events IS 'Append only audit trail of deletion progress with pseudonymous user identifiers'`,
      `COMMENT ON COLUMN deletion_audit_events.id IS 'Unique identifier of the event'`,
      `COMMENT ON COLUMN deletion_audit_events.deletion_request_id IS 'Deletion request the event belongs to'`,
      `COMMENT ON COLUMN deletion_audit_events.event_status IS 'Status that was reached with values ACCEPTED PROCESSING COMPLETED and FAILED'`,
      `COMMENT ON COLUMN deletion_audit_events.anonymized_user_hash IS 'Hmac sha256 value in lowercase hex that stays linkable by whoever holds the key'`,
      `COMMENT ON COLUMN deletion_audit_events.hmac_key_version IS 'Version of the key used to compute the hash'`,
      `COMMENT ON COLUMN deletion_audit_events.occurred_at IS 'Time the event happened'`,
      `COMMENT ON TABLE diagnostic_reports IS 'Anonymous diagnostic reports the user agreed to send with no link to any user'`,
      `COMMENT ON COLUMN diagnostic_reports.id IS 'Unique identifier of the report record'`,
      `COMMENT ON COLUMN diagnostic_reports.object_key IS 'Random key of the report in object storage'`,
      `COMMENT ON COLUMN diagnostic_reports.app_version IS 'Version of the app that produced the report'`,
      `COMMENT ON COLUMN diagnostic_reports.size_bytes IS 'Size of the report in bytes'`,
      `COMMENT ON COLUMN diagnostic_reports.created_at IS 'Time the report was received'`,
      `COMMENT ON COLUMN diagnostic_reports.expires_at IS 'Time after which the report must be deleted'`,
    ];

    for (const statement of statements) {
      await queryRunner.query(`${statement};`);
    }
  }

  private async clearComments(queryRunner: QueryRunner): Promise<void> {
    const targets = [
      'TABLE users',
      'COLUMN users.id',
      'COLUMN users.is_guest',
      'COLUMN users.preferred_language',
      'COLUMN users.created_at',
      'COLUMN users.updated_at',
      'TABLE auth_sessions',
      'COLUMN auth_sessions.id',
      'COLUMN auth_sessions.user_id',
      'COLUMN auth_sessions.family_id',
      'COLUMN auth_sessions.refresh_token_hash',
      'COLUMN auth_sessions.device_platform',
      'COLUMN auth_sessions.issued_at',
      'COLUMN auth_sessions.expires_at',
      'COLUMN auth_sessions.rotated_at',
      'COLUMN auth_sessions.revoked_at',
      'TABLE deletion_tokens',
      'COLUMN deletion_tokens.id',
      'COLUMN deletion_tokens.user_id',
      'COLUMN deletion_tokens.token_hash',
      'COLUMN deletion_tokens.created_at',
      'COLUMN deletion_tokens.expires_at',
      'COLUMN deletion_tokens.consumed_at',
      'TABLE user_preferences',
      'COLUMN user_preferences.user_id',
      'COLUMN user_preferences.speech_rate',
      'COLUMN user_preferences.high_contrast_enabled',
      'COLUMN user_preferences.haptic_enabled',
      'COLUMN user_preferences.haptic_intensity',
      'COLUMN user_preferences.voice_wake_word_enabled',
      'COLUMN user_preferences.cloud_ai_consent',
      'COLUMN user_preferences.diagnostic_analytics_consent',
      'COLUMN user_preferences.consent_policy_version',
      'COLUMN user_preferences.consent_updated_at',
      'COLUMN user_preferences.updated_at',
      'TABLE saved_locations',
      'COLUMN saved_locations.id',
      'COLUMN saved_locations.user_id',
      'COLUMN saved_locations.custom_label',
      'COLUMN saved_locations.latitude',
      'COLUMN saved_locations.longitude',
      'COLUMN saved_locations.created_at',
      'TABLE ai_models',
      'COLUMN ai_models.id',
      'COLUMN ai_models.model_key',
      'COLUMN ai_models.display_name',
      'COLUMN ai_models.task_family',
      'COLUMN ai_models.created_at',
      'TABLE ai_model_versions',
      'COLUMN ai_model_versions.id',
      'COLUMN ai_model_versions.model_id',
      'COLUMN ai_model_versions.version',
      'COLUMN ai_model_versions.artifact_sha256',
      'COLUMN ai_model_versions.artifact_uri',
      'COLUMN ai_model_versions.runtime',
      'COLUMN ai_model_versions.deployment_target',
      'COLUMN ai_model_versions.license',
      'COLUMN ai_model_versions.model_card_uri',
      'COLUMN ai_model_versions.rollback_target_version_id',
      'COLUMN ai_model_versions.status',
      'COLUMN ai_model_versions.created_at',
      'TABLE task_executions',
      'COLUMN task_executions.id',
      'COLUMN task_executions.user_id',
      'COLUMN task_executions.request_id',
      'COLUMN task_executions.client_task_id',
      'COLUMN task_executions.task_type',
      'COLUMN task_executions.status',
      'COLUMN task_executions.processing_time_ms',
      'COLUMN task_executions.error_code',
      'COLUMN task_executions.created_at',
      'COLUMN task_executions.completed_at',
      'TABLE task_model_runs',
      'COLUMN task_model_runs.id',
      'COLUMN task_model_runs.task_execution_id',
      'COLUMN task_model_runs.model_version_id',
      'COLUMN task_model_runs.run_role',
      'COLUMN task_model_runs.status',
      'COLUMN task_model_runs.processing_time_ms',
      'COLUMN task_model_runs.confidence',
      'COLUMN task_model_runs.error_code',
      'COLUMN task_model_runs.created_at',
      'COLUMN task_model_runs.completed_at',
      'TABLE deletion_requests',
      'COLUMN deletion_requests.id',
      'COLUMN deletion_requests.user_id',
      'COLUMN deletion_requests.status',
      'COLUMN deletion_requests.deletion_method',
      'COLUMN deletion_requests.idempotency_key_hash',
      'COLUMN deletion_requests.capability_hash',
      'COLUMN deletion_requests.stage_status',
      'COLUMN deletion_requests.failure_code',
      'COLUMN deletion_requests.accepted_at',
      'COLUMN deletion_requests.completed_at',
      'TABLE deletion_audit_events',
      'COLUMN deletion_audit_events.id',
      'COLUMN deletion_audit_events.deletion_request_id',
      'COLUMN deletion_audit_events.event_status',
      'COLUMN deletion_audit_events.anonymized_user_hash',
      'COLUMN deletion_audit_events.hmac_key_version',
      'COLUMN deletion_audit_events.occurred_at',
      'TABLE diagnostic_reports',
      'COLUMN diagnostic_reports.id',
      'COLUMN diagnostic_reports.object_key',
      'COLUMN diagnostic_reports.app_version',
      'COLUMN diagnostic_reports.size_bytes',
      'COLUMN diagnostic_reports.created_at',
      'COLUMN diagnostic_reports.expires_at',
    ];

    for (const target of targets) {
      await queryRunner.query(`COMMENT ON ${target} IS NULL;`);
    }
  }
}
