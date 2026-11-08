import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDiagnosticReports20261105120007 implements MigrationInterface {
  name = 'CreateDiagnosticReports20261105120007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
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
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE diagnostic_reports;`);
  }
}
