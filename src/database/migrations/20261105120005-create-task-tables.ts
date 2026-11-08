import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTaskTables20261105120005 implements MigrationInterface {
  name = 'CreateTaskTables20261105120005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
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
    `);

    await queryRunner.query(`
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
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE task_model_runs;`);
    await queryRunner.query(`DROP TABLE task_executions;`);
  }
}
