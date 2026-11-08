import { MigrationInterface, QueryRunner } from 'typeorm';

export class FoundationalFunctions20261105120001 implements MigrationInterface {
  name = 'FoundationalFunctions20261105120001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION set_updated_at()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
          NEW.updated_at := now();
          RETURN NEW;
      END;
      $$;
    `);

    await queryRunner.query(`
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
    `);

    await queryRunner.query(`
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
    `);

    await queryRunner.query(`
      CREATE FUNCTION reject_row_update()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
          RAISE EXCEPTION 'rows in % cannot be updated', TG_TABLE_NAME
              USING ERRCODE = 'restrict_violation';
      END;
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION IF EXISTS reject_row_update();`);
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS enforce_deletion_status_transition();`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS enforce_task_status_transition();`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS set_updated_at();`);
  }
}
