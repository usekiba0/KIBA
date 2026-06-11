import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Goal anchor flag (Karibi feedback 2026-06-03 — "allow people to have more than
 * one goal"), Phase 1.
 *
 * Users may now hold several goals. Exactly one is the ANCHOR that drives the
 * daily loop (check-in/DailyTask seeding, ghost, difficulty adjustment, plan
 * generation); the rest are stored and referenced but not pushed daily. The
 * anchor is resolved via findAnchorGoal(), which prefers this flag.
 *
 * Backfill: every existing row becomes its user's anchor. Until now there was
 * effectively one goal per user, so flagging all existing rows is correct and
 * keeps the anchor query resolving for legacy data without a fallback hop.
 */
export class AddGoalAnchorFlag1780400000000 implements MigrationInterface {
    name = 'AddGoalAnchorFlag1780400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "goals"
            ADD COLUMN IF NOT EXISTS "is_anchor" boolean NOT NULL DEFAULT false
        `);
        // Existing data is one-goal-per-user — promote every current row to anchor.
        await queryRunner.query(`
            UPDATE "goals" SET "is_anchor" = true
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_goals_is_anchor" ON "goals" ("is_anchor")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_goals_is_anchor"
        `);
        await queryRunner.query(`
            ALTER TABLE "goals" DROP COLUMN IF EXISTS "is_anchor"
        `);
    }
}
