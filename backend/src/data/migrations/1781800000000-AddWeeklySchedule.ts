import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Somewhere to keep a user's standing weekly commitment (Karibi 2026-07-21).
 *
 * The morning check-in re-asked "pick your PPL days and times" thirteen hours
 * after the user had answered it in chat, because the answer had no home: the
 * profile tool takes a closed enum of psychological fields, the action plan's
 * weekly breakdown is written once at plan time, and to-dos are per-day.
 *
 * Additive and nullable — NULL means "no schedule on file", which is exactly
 * the behaviour every existing row already has, so this deploys with zero
 * behaviour change.
 */
export class AddWeeklySchedule1781800000000 implements MigrationInterface {
  name = 'AddWeeklySchedule1781800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "weekly_schedule" text
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "weekly_schedule_updated_at" TIMESTAMP WITH TIME ZONE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "weekly_schedule_updated_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "weekly_schedule"
    `);
  }
}
