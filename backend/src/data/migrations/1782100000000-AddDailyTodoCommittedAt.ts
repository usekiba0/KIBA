import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Task-composition Approach C, Phase 1 (2026-07-24).
 *
 * `committed_at` marks when the user AGREED to a to-do. null = a proposal (an
 * auto-seeded PLAN row the conversation never confirmed); set = a commitment.
 * Recap and weekly-review miss/done counts now key on THIS instead of on
 * `source`, so nothing the user never agreed to can shame them.
 *
 * Backfill is chosen to be exactly behaviour-preserving for existing data:
 *   - USER / AI rows → committed_at = created_at (they were put there in
 *     conversation, so they were always commitments).
 *   - any DONE row (incl. PLAN) → committed_at = completed_at ?? created_at
 *     (completion is agreement — a finished plan item always counted as "done").
 *   - OPEN PLAN rows → stay null (the un-agreed proposals the counts already
 *     excluded via `source !== PLAN`).
 * With this backfill the done/missed SETS are identical before and after the
 * count-logic switch — Phase 1 is invisible plumbing.
 */
export class AddDailyTodoCommittedAt1782100000000 implements MigrationInterface {
  name = 'AddDailyTodoCommittedAt1782100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "daily_todos"
      ADD COLUMN IF NOT EXISTS "committed_at" timestamptz NULL
    `);
    await queryRunner.query(`
      UPDATE "daily_todos"
      SET "committed_at" = COALESCE("completed_at", "created_at")
      WHERE "committed_at" IS NULL
        AND ("source" IN ('user', 'ai') OR "status" = 'done')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "daily_todos" DROP COLUMN IF EXISTS "committed_at"
    `);
  }
}
