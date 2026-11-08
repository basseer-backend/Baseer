BEGIN;

CREATE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE FUNCTION enforce_task_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'PENDING'
       AND NEW.status IN ('PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED') THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'PROCESSING'
       AND NEW.status IN ('COMPLETED', 'FAILED', 'CANCELLED') THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'invalid status transition from % to % on %', OLD.status, NEW.status, TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
END;
$$;

CREATE FUNCTION enforce_deletion_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'ACCEPTED' AND NEW.status IN ('PROCESSING', 'FAILED') THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'PROCESSING' AND NEW.status IN ('COMPLETED', 'FAILED') THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'FAILED' AND NEW.status = 'PROCESSING' THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'invalid deletion status transition from % to %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
END;
$$;

CREATE FUNCTION reject_row_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'rows in % cannot be updated', TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TABLE users (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    is_guest boolean NOT NULL DEFAULT true,
    preferred_language varchar(5) NOT NULL DEFAULT 'ar-EG',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_users PRIMARY KEY (id),
    CONSTRAINT ck_users_preferred_language CHECK (preferred_language IN ('ar-EG', 'en-US'))
);

CREATE TABLE auth_sessions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    family_id uuid NOT NULL,
    refresh_token_hash char(64) NOT NULL,
    device_platform varchar(32) NOT NULL,
    issued_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    rotated_at timestamptz,
    revoked_at timestamptz,
    CONSTRAINT pk_auth_sessions PRIMARY KEY (id),
    CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT uq_auth_sessions_refresh_token_hash UNIQUE (refresh_token_hash),
    CONSTRAINT ck_auth_sessions_hash_format CHECK (refresh_token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_auth_sessions_platform CHECK (char_length(device_platform) > 0),
    CONSTRAINT ck_auth_sessions_expiry CHECK (expires_at > issued_at),
    CONSTRAINT ck_auth_sessions_rotated CHECK (rotated_at IS NULL OR rotated_at >= issued_at),
    CONSTRAINT ck_auth_sessions_revoked CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);

CREATE TABLE deletion_tokens (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    token_hash char(64) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    CONSTRAINT pk_deletion_tokens PRIMARY KEY (id),
    CONSTRAINT fk_deletion_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT uq_deletion_tokens_token_hash UNIQUE (token_hash),
    CONSTRAINT ck_deletion_tokens_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_deletion_tokens_expiry CHECK (expires_at > created_at),
    CONSTRAINT ck_deletion_tokens_consumed CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE TABLE user_preferences (
    user_id uuid NOT NULL,
    speech_rate numeric(4, 2) NOT NULL DEFAULT 1.00,
    high_contrast_enabled boolean NOT NULL DEFAULT false,
    haptic_enabled boolean NOT NULL DEFAULT true,
    haptic_intensity varchar(6) NOT NULL DEFAULT 'medium',
    voice_wake_word_enabled boolean NOT NULL DEFAULT false,
    cloud_ai_consent boolean NOT NULL DEFAULT false,
    diagnostic_analytics_consent boolean NOT NULL DEFAULT false,
    consent_policy_version varchar(32),
    consent_updated_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_user_preferences PRIMARY KEY (user_id),
    CONSTRAINT fk_user_preferences_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT ck_user_preferences_speech_rate CHECK (speech_rate BETWEEN 0.50 AND 3.00),
    CONSTRAINT ck_user_preferences_haptic_intensity CHECK (haptic_intensity IN ('low', 'medium', 'high')),
    CONSTRAINT ck_user_preferences_consent_record CHECK (
        (NOT cloud_ai_consent AND NOT diagnostic_analytics_consent)
        OR (consent_policy_version IS NOT NULL AND consent_updated_at IS NOT NULL)
    )
);

CREATE TABLE saved_locations (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    custom_label varchar(100) NOT NULL,
    latitude numeric(9, 6) NOT NULL,
    longitude numeric(9, 6) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_saved_locations PRIMARY KEY (id),
    CONSTRAINT fk_saved_locations_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT ck_saved_locations_label CHECK (char_length(btrim(custom_label)) > 0),
    CONSTRAINT ck_saved_locations_latitude CHECK (latitude BETWEEN -90 AND 90),
    CONSTRAINT ck_saved_locations_longitude CHECK (longitude BETWEEN -180 AND 180)
);

CREATE TABLE ai_models (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    model_key varchar(64) NOT NULL,
    display_name varchar(120) NOT NULL,
    task_family varchar(48) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_ai_models PRIMARY KEY (id),
    CONSTRAINT uq_ai_models_model_key UNIQUE (model_key),
    CONSTRAINT ck_ai_models_model_key CHECK (model_key ~ '^[a-z0-9][a-z0-9_.-]*$')
);

CREATE TABLE ai_model_versions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    model_id uuid NOT NULL,
    version varchar(32) NOT NULL,
    artifact_sha256 char(64) NOT NULL,
    artifact_uri text NOT NULL,
    runtime varchar(32) NOT NULL,
    deployment_target varchar(6) NOT NULL,
    license varchar(64) NOT NULL,
    model_card_uri text,
    rollback_target_version_id uuid,
    status varchar(16) NOT NULL DEFAULT 'draft',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_ai_model_versions PRIMARY KEY (id),
    CONSTRAINT fk_ai_model_versions_model FOREIGN KEY (model_id) REFERENCES ai_models (id) ON DELETE RESTRICT,
    CONSTRAINT uq_ai_model_versions_model_version UNIQUE (model_id, version),
    CONSTRAINT uq_ai_model_versions_id_model UNIQUE (id, model_id),
    CONSTRAINT fk_ai_model_versions_rollback FOREIGN KEY (rollback_target_version_id, model_id)
        REFERENCES ai_model_versions (id, model_id) ON DELETE RESTRICT,
    CONSTRAINT ck_ai_model_versions_sha256 CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_ai_model_versions_target CHECK (deployment_target IN ('cloud', 'mobile')),
    CONSTRAINT ck_ai_model_versions_status CHECK (status IN ('draft', 'approved', 'active', 'deprecated', 'retired')),
    CONSTRAINT ck_ai_model_versions_rollback_self CHECK (rollback_target_version_id IS NULL OR rollback_target_version_id <> id)
);

CREATE TABLE task_executions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    request_id uuid NOT NULL,
    client_task_id uuid NOT NULL,
    task_type varchar(48) NOT NULL,
    status varchar(16) NOT NULL DEFAULT 'PENDING',
    processing_time_ms integer,
    error_code varchar(64),
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    CONSTRAINT pk_task_executions PRIMARY KEY (id),
    CONSTRAINT fk_task_executions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT uq_task_executions_user_client_task UNIQUE (user_id, client_task_id),
    CONSTRAINT ck_task_executions_task_type CHECK (char_length(task_type) > 0),
    CONSTRAINT ck_task_executions_status CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    CONSTRAINT ck_task_executions_processing_time CHECK (processing_time_ms IS NULL OR processing_time_ms >= 0),
    CONSTRAINT ck_task_executions_completion CHECK (
        (status IN ('PENDING', 'PROCESSING') AND completed_at IS NULL)
        OR (status IN ('COMPLETED', 'FAILED', 'CANCELLED') AND completed_at IS NOT NULL AND completed_at >= created_at)
    )
);

CREATE TABLE task_model_runs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    task_execution_id uuid NOT NULL,
    model_version_id uuid NOT NULL,
    run_role varchar(8) NOT NULL,
    status varchar(16) NOT NULL DEFAULT 'PENDING',
    processing_time_ms integer,
    confidence numeric(5, 4),
    error_code varchar(64),
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    CONSTRAINT pk_task_model_runs PRIMARY KEY (id),
    CONSTRAINT fk_task_model_runs_task FOREIGN KEY (task_execution_id) REFERENCES task_executions (id) ON DELETE CASCADE,
    CONSTRAINT fk_task_model_runs_model_version FOREIGN KEY (model_version_id) REFERENCES ai_model_versions (id) ON DELETE RESTRICT,
    CONSTRAINT ck_task_model_runs_role CHECK (run_role IN ('primary', 'fallback')),
    CONSTRAINT ck_task_model_runs_status CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    CONSTRAINT ck_task_model_runs_processing_time CHECK (processing_time_ms IS NULL OR processing_time_ms >= 0),
    CONSTRAINT ck_task_model_runs_confidence CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    CONSTRAINT ck_task_model_runs_completion CHECK (
        (status IN ('PENDING', 'PROCESSING') AND completed_at IS NULL)
        OR (status IN ('COMPLETED', 'FAILED', 'CANCELLED') AND completed_at IS NOT NULL AND completed_at >= created_at)
    )
);

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

CREATE TABLE diagnostic_reports (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    object_key text NOT NULL,
    app_version varchar(32) NOT NULL,
    size_bytes integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    CONSTRAINT pk_diagnostic_reports PRIMARY KEY (id),
    CONSTRAINT uq_diagnostic_reports_object_key UNIQUE (object_key),
    CONSTRAINT ck_diagnostic_reports_size CHECK (size_bytes > 0),
    CONSTRAINT ck_diagnostic_reports_expiry CHECK (expires_at > created_at)
);

CREATE INDEX ix_auth_sessions_user_id ON auth_sessions (user_id);
CREATE INDEX ix_auth_sessions_family_id ON auth_sessions (family_id);
CREATE INDEX ix_auth_sessions_expires_at ON auth_sessions (expires_at);

CREATE INDEX ix_deletion_tokens_user_id ON deletion_tokens (user_id);
CREATE INDEX ix_deletion_tokens_expires_at ON deletion_tokens (expires_at);

CREATE INDEX ix_saved_locations_user_created ON saved_locations (user_id, created_at DESC);

CREATE UNIQUE INDEX uq_ai_model_versions_active_target
    ON ai_model_versions (model_id, deployment_target)
    WHERE status = 'active';
CREATE INDEX ix_ai_model_versions_rollback_target
    ON ai_model_versions (rollback_target_version_id)
    WHERE rollback_target_version_id IS NOT NULL;

CREATE INDEX ix_task_executions_user_created ON task_executions (user_id, created_at DESC);
CREATE INDEX ix_task_executions_request_id ON task_executions (request_id);
CREATE INDEX ix_task_executions_open
    ON task_executions (created_at)
    WHERE status IN ('PENDING', 'PROCESSING');
CREATE INDEX ix_task_executions_created_at ON task_executions (created_at);

CREATE INDEX ix_task_model_runs_task ON task_model_runs (task_execution_id);
CREATE INDEX ix_task_model_runs_model_version ON task_model_runs (model_version_id, created_at DESC);
CREATE UNIQUE INDEX uq_task_model_runs_primary
    ON task_model_runs (task_execution_id)
    WHERE run_role = 'primary';

CREATE INDEX ix_deletion_requests_user_id
    ON deletion_requests (user_id)
    WHERE user_id IS NOT NULL;
CREATE INDEX ix_deletion_requests_open
    ON deletion_requests (accepted_at)
    WHERE status IN ('ACCEPTED', 'PROCESSING');

CREATE INDEX ix_deletion_audit_events_request ON deletion_audit_events (deletion_request_id, occurred_at);

CREATE INDEX ix_diagnostic_reports_expires_at ON diagnostic_reports (expires_at);

CREATE TRIGGER trg_users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_user_preferences_set_updated_at
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_task_executions_status_transition
    BEFORE UPDATE OF status ON task_executions
    FOR EACH ROW EXECUTE FUNCTION enforce_task_status_transition();

CREATE TRIGGER trg_task_model_runs_status_transition
    BEFORE UPDATE OF status ON task_model_runs
    FOR EACH ROW EXECUTE FUNCTION enforce_task_status_transition();

CREATE TRIGGER trg_deletion_requests_status_transition
    BEFORE UPDATE OF status ON deletion_requests
    FOR EACH ROW EXECUTE FUNCTION enforce_deletion_status_transition();

CREATE TRIGGER trg_deletion_audit_events_immutable
    BEFORE UPDATE ON deletion_audit_events
    FOR EACH ROW EXECUTE FUNCTION reject_row_update();

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

CREATE FUNCTION purge_expired_diagnostic_reports()
RETURNS SETOF text
LANGUAGE sql
AS $$
    DELETE FROM diagnostic_reports
    WHERE expires_at <= now()
    RETURNING object_key;
$$;

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

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'blind_assistant_app') THEN
        CREATE ROLE blind_assistant_app NOLOGIN;
    END IF;
END;
$$;

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

GRANT SELECT, INSERT ON deletion_audit_events TO blind_assistant_app;
GRANT SELECT ON ai_models, ai_model_versions TO blind_assistant_app;

REVOKE ALL ON FUNCTION
    revoke_auth_session_family(uuid),
    purge_expired_auth_sessions(interval),
    purge_expired_deletion_tokens(interval),
    purge_expired_diagnostic_reports(),
    complete_account_deletion(uuid, char, smallint)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    revoke_auth_session_family(uuid),
    purge_expired_auth_sessions(interval),
    purge_expired_deletion_tokens(interval),
    purge_expired_diagnostic_reports(),
    complete_account_deletion(uuid, char, smallint)
TO blind_assistant_app;

COMMENT ON TABLE users IS 'Application users including anonymous guests with no personal data';
COMMENT ON COLUMN users.id IS 'Unique identifier of the user';
COMMENT ON COLUMN users.is_guest IS 'True when the user has an anonymous guest session';
COMMENT ON COLUMN users.preferred_language IS 'Interface and speech language with two allowed values for Egyptian Arabic and American English';
COMMENT ON COLUMN users.created_at IS 'Time the user record was created';
COMMENT ON COLUMN users.updated_at IS 'Time the user record last changed';

COMMENT ON TABLE auth_sessions IS 'Refresh token sessions grouped in rotation families so reuse of an old token can revoke the whole family';
COMMENT ON COLUMN auth_sessions.id IS 'Unique identifier of the session';
COMMENT ON COLUMN auth_sessions.user_id IS 'Owner of the session';
COMMENT ON COLUMN auth_sessions.family_id IS 'Shared by every token issued from one login through rotation';
COMMENT ON COLUMN auth_sessions.refresh_token_hash IS 'Sha256 hash in lowercase hex of the refresh token and never the token itself';
COMMENT ON COLUMN auth_sessions.device_platform IS 'Platform of the device that owns the session';
COMMENT ON COLUMN auth_sessions.issued_at IS 'Time the refresh token was issued';
COMMENT ON COLUMN auth_sessions.expires_at IS 'Time after which the refresh token is no longer valid';
COMMENT ON COLUMN auth_sessions.rotated_at IS 'Time the token was exchanged for a new one';
COMMENT ON COLUMN auth_sessions.revoked_at IS 'Time the session was revoked';

COMMENT ON TABLE deletion_tokens IS 'Single purpose tokens that can only be used to request account deletion and check its status';
COMMENT ON COLUMN deletion_tokens.id IS 'Unique identifier of the token record';
COMMENT ON COLUMN deletion_tokens.user_id IS 'User the token belongs to';
COMMENT ON COLUMN deletion_tokens.token_hash IS 'Sha256 hash in lowercase hex of the delete only token';
COMMENT ON COLUMN deletion_tokens.created_at IS 'Time the token was created';
COMMENT ON COLUMN deletion_tokens.expires_at IS 'Time after which the token is no longer valid';
COMMENT ON COLUMN deletion_tokens.consumed_at IS 'Time the token was used';

COMMENT ON TABLE user_preferences IS 'Accessibility settings and consent choices of one user';
COMMENT ON COLUMN user_preferences.user_id IS 'User that owns the preferences';
COMMENT ON COLUMN user_preferences.speech_rate IS 'Speech speed multiplier where one is normal speed';
COMMENT ON COLUMN user_preferences.high_contrast_enabled IS 'True when the high contrast display is on';
COMMENT ON COLUMN user_preferences.haptic_enabled IS 'True when vibration feedback is on';
COMMENT ON COLUMN user_preferences.haptic_intensity IS 'Vibration strength with three allowed values low medium and high';
COMMENT ON COLUMN user_preferences.voice_wake_word_enabled IS 'True when the voice wake word is on';
COMMENT ON COLUMN user_preferences.cloud_ai_consent IS 'True when the user agreed to send data to cloud AI features';
COMMENT ON COLUMN user_preferences.diagnostic_analytics_consent IS 'True when the user agreed to send anonymous diagnostic reports';
COMMENT ON COLUMN user_preferences.consent_policy_version IS 'Version of the privacy policy the user agreed to';
COMMENT ON COLUMN user_preferences.consent_updated_at IS 'Time the consent choices last changed';
COMMENT ON COLUMN user_preferences.updated_at IS 'Time the preferences last changed';

COMMENT ON TABLE saved_locations IS 'Places the user chose to save and only when the user asks';
COMMENT ON COLUMN saved_locations.id IS 'Unique identifier of the saved place';
COMMENT ON COLUMN saved_locations.user_id IS 'User that owns the saved place';
COMMENT ON COLUMN saved_locations.custom_label IS 'Name the user gave to the place';
COMMENT ON COLUMN saved_locations.latitude IS 'Latitude in decimal degrees';
COMMENT ON COLUMN saved_locations.longitude IS 'Longitude in decimal degrees';
COMMENT ON COLUMN saved_locations.created_at IS 'Time the place was saved';

COMMENT ON TABLE ai_models IS 'Catalogue of AI models and this is not user data so account deletion never removes it';
COMMENT ON COLUMN ai_models.id IS 'Unique identifier of the model';
COMMENT ON COLUMN ai_models.model_key IS 'Stable unique key used in code to refer to the model';
COMMENT ON COLUMN ai_models.display_name IS 'Readable name of the model';
COMMENT ON COLUMN ai_models.task_family IS 'Group of tasks the model serves';
COMMENT ON COLUMN ai_models.created_at IS 'Time the model was added to the catalogue';

COMMENT ON TABLE ai_model_versions IS 'Versions of each AI model with integrity hash licence and rollback target';
COMMENT ON COLUMN ai_model_versions.id IS 'Unique identifier of the model version';
COMMENT ON COLUMN ai_model_versions.model_id IS 'Model this version belongs to';
COMMENT ON COLUMN ai_model_versions.version IS 'Version label that is unique for each model';
COMMENT ON COLUMN ai_model_versions.artifact_sha256 IS 'Sha256 hash in lowercase hex of the model file';
COMMENT ON COLUMN ai_model_versions.artifact_uri IS 'Location of the model file';
COMMENT ON COLUMN ai_model_versions.runtime IS 'Inference runtime that loads the model';
COMMENT ON COLUMN ai_model_versions.deployment_target IS 'Where the model runs which is cloud or mobile';
COMMENT ON COLUMN ai_model_versions.license IS 'Licence that covers the model';
COMMENT ON COLUMN ai_model_versions.model_card_uri IS 'Location of the model card';
COMMENT ON COLUMN ai_model_versions.rollback_target_version_id IS 'Earlier version of the same model to return to when this version must be rolled back';
COMMENT ON COLUMN ai_model_versions.status IS 'Lifecycle state with values draft approved active deprecated and retired';
COMMENT ON COLUMN ai_model_versions.created_at IS 'Time the version was added to the catalogue';

COMMENT ON TABLE task_executions IS 'Metadata of cloud tasks and never the media transcripts or extracted text';
COMMENT ON COLUMN task_executions.id IS 'Unique identifier of the task';
COMMENT ON COLUMN task_executions.user_id IS 'User that started the task';
COMMENT ON COLUMN task_executions.request_id IS 'Value of the request id header sent by the client';
COMMENT ON COLUMN task_executions.client_task_id IS 'Task id created by the client and unique for each user';
COMMENT ON COLUMN task_executions.task_type IS 'Kind of task such as scene description or document reading';
COMMENT ON COLUMN task_executions.status IS 'Task state with values PENDING PROCESSING COMPLETED FAILED and CANCELLED';
COMMENT ON COLUMN task_executions.processing_time_ms IS 'Total processing time in milliseconds';
COMMENT ON COLUMN task_executions.error_code IS 'Stable machine readable error code when the task failed';
COMMENT ON COLUMN task_executions.created_at IS 'Time the task was created';
COMMENT ON COLUMN task_executions.completed_at IS 'Time the task reached a final state';

COMMENT ON TABLE task_model_runs IS 'Model runs that belong to a task including fallback runs';
COMMENT ON COLUMN task_model_runs.id IS 'Unique identifier of the run';
COMMENT ON COLUMN task_model_runs.task_execution_id IS 'Task the run belongs to';
COMMENT ON COLUMN task_model_runs.model_version_id IS 'Model version that was used';
COMMENT ON COLUMN task_model_runs.run_role IS 'Role of the run which is primary or fallback and each task has at most one primary run';
COMMENT ON COLUMN task_model_runs.status IS 'Run state with values PENDING PROCESSING COMPLETED FAILED and CANCELLED';
COMMENT ON COLUMN task_model_runs.processing_time_ms IS 'Processing time of the run in milliseconds';
COMMENT ON COLUMN task_model_runs.confidence IS 'Model confidence between zero and one and it is not calibrated unless measured';
COMMENT ON COLUMN task_model_runs.error_code IS 'Stable machine readable error code when the run failed';
COMMENT ON COLUMN task_model_runs.created_at IS 'Time the run was created';
COMMENT ON COLUMN task_model_runs.completed_at IS 'Time the run reached a final state';

COMMENT ON TABLE deletion_requests IS 'Account deletion workflow state that stays after the user is removed';
COMMENT ON COLUMN deletion_requests.id IS 'Request id that is also the deletion receipt id';
COMMENT ON COLUMN deletion_requests.user_id IS 'User being deleted and it becomes empty after the purge';
COMMENT ON COLUMN deletion_requests.status IS 'Workflow state with values ACCEPTED PROCESSING COMPLETED and FAILED';
COMMENT ON COLUMN deletion_requests.deletion_method IS 'How the request arrived either online or by replaying an offline tombstone';
COMMENT ON COLUMN deletion_requests.idempotency_key_hash IS 'Sha256 hash in lowercase hex of the idempotency key';
COMMENT ON COLUMN deletion_requests.capability_hash IS 'Sha256 hash in lowercase hex of the token that allows status polling';
COMMENT ON COLUMN deletion_requests.stage_status IS 'Progress of each deletion stage stored as a json object';
COMMENT ON COLUMN deletion_requests.failure_code IS 'Stable machine readable code that explains why the request failed';
COMMENT ON COLUMN deletion_requests.accepted_at IS 'Time the request was accepted';
COMMENT ON COLUMN deletion_requests.completed_at IS 'Time the request was completed';

COMMENT ON TABLE deletion_audit_events IS 'Append only audit trail of deletion progress with pseudonymous user identifiers';
COMMENT ON COLUMN deletion_audit_events.id IS 'Unique identifier of the event';
COMMENT ON COLUMN deletion_audit_events.deletion_request_id IS 'Deletion request the event belongs to';
COMMENT ON COLUMN deletion_audit_events.event_status IS 'Status that was reached with values ACCEPTED PROCESSING COMPLETED and FAILED';
COMMENT ON COLUMN deletion_audit_events.anonymized_user_hash IS 'Hmac sha256 value in lowercase hex that stays linkable by whoever holds the key';
COMMENT ON COLUMN deletion_audit_events.hmac_key_version IS 'Version of the key used to compute the hash';
COMMENT ON COLUMN deletion_audit_events.occurred_at IS 'Time the event happened';

COMMENT ON TABLE diagnostic_reports IS 'Anonymous diagnostic reports the user agreed to send with no link to any user';
COMMENT ON COLUMN diagnostic_reports.id IS 'Unique identifier of the report record';
COMMENT ON COLUMN diagnostic_reports.object_key IS 'Random key of the report in object storage';
COMMENT ON COLUMN diagnostic_reports.app_version IS 'Version of the app that produced the report';
COMMENT ON COLUMN diagnostic_reports.size_bytes IS 'Size of the report in bytes';
COMMENT ON COLUMN diagnostic_reports.created_at IS 'Time the report was received';
COMMENT ON COLUMN diagnostic_reports.expires_at IS 'Time after which the report must be deleted';

COMMIT;
