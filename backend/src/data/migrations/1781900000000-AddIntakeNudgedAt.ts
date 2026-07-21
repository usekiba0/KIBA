import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marker for the one-per-lead intake-stall nudge (2026-07-21).
 *
 * Additive and nullable. NULL means "never nudged" — which is every existing
 * row — so the first sweep after deploy is bounded only by the 7-day staleness
 * window in `intake-nudge.ts`, not by the whole history of the table.
 */
export class AddIntakeNudgedAt1781900000000 implements MigrationInterface {
  name = 'AddIntakeNudgedAt1781900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "intake_nudged_at" TIMESTAMP WITH TIME ZONE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "intake_nudged_at"
    `);
  }
}
