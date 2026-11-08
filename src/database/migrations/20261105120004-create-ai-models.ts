import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiModels20261105120004 implements MigrationInterface {
  name = 'CreateAiModels20261105120004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
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
    `);

    await queryRunner.query(`
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
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE ai_model_versions;`);
    await queryRunner.query(`DROP TABLE ai_models;`);
  }
}
