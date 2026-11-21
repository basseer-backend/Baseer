import { MigrationInterface, QueryRunner } from 'typeorm';
import { BASEER_PLANNED_MODELS } from '../seeds/ai-models.seed';

export class EnhanceAiModelsRegistry20261114000001
  implements MigrationInterface
{
  name = 'EnhanceAiModelsRegistry20261114000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Enhance ai_models table with description, task_type, provider, status, and updated_at
    await queryRunner.query(`
      ALTER TABLE ai_models
        ADD COLUMN IF NOT EXISTS description text,
        ADD COLUMN IF NOT EXISTS task_type varchar(48),
        ADD COLUMN IF NOT EXISTS provider varchar(64) NOT NULL DEFAULT 'planned',
        ADD COLUMN IF NOT EXISTS status varchar(24) NOT NULL DEFAULT 'planned',
        ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
    `);

    // Backfill task_type from existing task_family
    await queryRunner.query(`
      UPDATE ai_models
      SET task_type = task_family
      WHERE task_type IS NULL;
    `);

    // Idempotently create status check constraint for ai_models
    await queryRunner.query(`
      ALTER TABLE ai_models
        DROP CONSTRAINT IF EXISTS ck_ai_models_status;
      ALTER TABLE ai_models
        ADD CONSTRAINT ck_ai_models_status
        CHECK (status IN ('planned', 'active', 'inactive', 'deprecated'));
    `);

    // Idempotently create updated_at trigger for ai_models
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_ai_models_set_updated_at ON ai_models;
      CREATE TRIGGER trg_ai_models_set_updated_at
        BEFORE UPDATE ON ai_models
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);

    // 2. Enhance ai_model_versions table
    await queryRunner.query(`
      ALTER TABLE ai_model_versions
        ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
        ALTER COLUMN artifact_sha256 DROP NOT NULL,
        ALTER COLUMN artifact_uri DROP NOT NULL;
    `);

    // Idempotently create updated_at trigger for ai_model_versions
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_ai_model_versions_set_updated_at ON ai_model_versions;
      CREATE TRIGGER trg_ai_model_versions_set_updated_at
        BEFORE UPDATE ON ai_model_versions
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);

    // Update status and hash constraints on ai_model_versions to support planned models without fabricating hashes
    await queryRunner.query(`
      ALTER TABLE ai_model_versions
        DROP CONSTRAINT IF EXISTS ck_ai_model_versions_artifact_presence,
        DROP CONSTRAINT IF EXISTS ck_ai_model_versions_sha256,
        DROP CONSTRAINT IF EXISTS ck_ai_model_versions_status;
    `);

    await queryRunner.query(`
      ALTER TABLE ai_model_versions
        ADD CONSTRAINT ck_ai_model_versions_status
          CHECK (status IN ('planned', 'draft', 'approved', 'active', 'deprecated', 'retired')),
        ADD CONSTRAINT ck_ai_model_versions_sha256
          CHECK (artifact_sha256 IS NULL OR artifact_sha256 ~ '^[0-9a-f]{64}$'),
        ADD CONSTRAINT ck_ai_model_versions_artifact_presence
          CHECK (status = 'planned' OR (artifact_sha256 IS NOT NULL AND artifact_uri IS NOT NULL));
    `);

    // 3. Seed initial 11 planned Baseer AI models idempotently, preserving any custom manual providers/statuses
    for (const model of BASEER_PLANNED_MODELS) {
      await queryRunner.query(
        `
        INSERT INTO ai_models (
          model_key,
          display_name,
          task_family,
          task_type,
          description,
          provider,
          status,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
        ON CONFLICT (model_key) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          task_family = EXCLUDED.task_family,
          task_type = EXCLUDED.task_type,
          description = EXCLUDED.description,
          provider = CASE 
            WHEN ai_models.provider IS NOT NULL AND ai_models.provider <> 'planned' 
            THEN ai_models.provider 
            ELSE EXCLUDED.provider 
          END,
          status = CASE 
            WHEN ai_models.status IS NOT NULL AND ai_models.status <> 'planned' 
            THEN ai_models.status 
            ELSE EXCLUDED.status 
          END,
          updated_at = now();
        `,
        [
          model.modelKey,
          model.displayName,
          model.taskFamily,
          model.taskType,
          model.description,
          model.provider,
          model.status,
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Remove seeded planned models safely without violating foreign keys of active models
    const keys = BASEER_PLANNED_MODELS.map((m) => `'${m.modelKey}'`).join(', ');
    await queryRunner.query(`
      DELETE FROM ai_models 
      WHERE model_key IN (${keys})
        AND status = 'planned'
        AND id NOT IN (SELECT DISTINCT model_id FROM ai_model_versions);
    `);

    // 2. Revert ai_model_versions constraints & triggers
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_ai_model_versions_set_updated_at ON ai_model_versions;
      ALTER TABLE ai_model_versions
        DROP CONSTRAINT IF EXISTS ck_ai_model_versions_artifact_presence,
        DROP CONSTRAINT IF EXISTS ck_ai_model_versions_sha256,
        DROP CONSTRAINT IF EXISTS ck_ai_model_versions_status;
      ALTER TABLE ai_model_versions
        ADD CONSTRAINT ck_ai_model_versions_status
          CHECK (status IN ('draft', 'approved', 'active', 'deprecated', 'retired')),
        ADD CONSTRAINT ck_ai_model_versions_sha256
          CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$');
      ALTER TABLE ai_model_versions
        DROP COLUMN IF EXISTS updated_at;
    `);

    // 3. Revert ai_models enhancements
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_ai_models_set_updated_at ON ai_models;
      ALTER TABLE ai_models
        DROP CONSTRAINT IF EXISTS ck_ai_models_status,
        DROP COLUMN IF EXISTS updated_at,
        DROP COLUMN IF EXISTS status,
        DROP COLUMN IF EXISTS provider,
        DROP COLUMN IF EXISTS task_type,
        DROP COLUMN IF EXISTS description;
    `);
  }
}
