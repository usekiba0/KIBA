import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Goal Type column (Karibi feedback 2026-06-01, Phase 1).
 *
 * Labels each goal so proactive copy can branch: only deadline-bound TASKS get
 * "did it happen?"; long-term OUTCOME / IDENTITY / EMOTIONAL / HABIT goals get
 * "what's the move today?". Fixes the "Make 100k a month... happen or nah?" bug.
 *
 * Stored as varchar (not a PG enum) to stay cheap to extend later. Backfilled to
 * 'outcome' — the safe default that routes to "what's the move today?" rather
 * than the broken overnight-completion prompt. A follow-up could reclassify
 * existing rows via classifyGoalType(), but new goals are classified at
 * plan-generation so the backfill default is harmless.
 */
export class AddGoalType1780100000000 implements MigrationInterface {
    name = 'AddGoalType1780100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "goals"
            ADD COLUMN IF NOT EXISTS "goal_type" varchar(20) NOT NULL DEFAULT 'outcome'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "goals" DROP COLUMN IF EXISTS "goal_type"
        `);
    }
}
