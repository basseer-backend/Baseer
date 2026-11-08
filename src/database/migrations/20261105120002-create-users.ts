import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsers20261105120002 implements MigrationInterface {
  name = 'CreateUsers20261105120002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          is_guest boolean NOT NULL DEFAULT true,
          preferred_language varchar(5) NOT NULL DEFAULT 'ar-EG',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT pk_users PRIMARY KEY (id),
          CONSTRAINT ck_users_preferred_language CHECK (preferred_language IN ('ar-EG', 'en-US'))
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE users;`);
  }
}
