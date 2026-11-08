import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserRelatedTables20261105120003 implements MigrationInterface {
  name = 'CreateUserRelatedTables20261105120003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
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
    `);

    await queryRunner.query(`
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
    `);

    await queryRunner.query(`
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
    `);

    await queryRunner.query(`
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
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE saved_locations;`);
    await queryRunner.query(`DROP TABLE user_preferences;`);
    await queryRunner.query(`DROP TABLE deletion_tokens;`);
    await queryRunner.query(`DROP TABLE auth_sessions;`);
  }
}
