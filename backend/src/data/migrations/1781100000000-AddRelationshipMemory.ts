import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Persistent relationship memory (Layer 2 of the 2026-06-24 memory rework).
 * A single evolving prose digest per user — who they are, their goals/why,
 * recent life events, commitments kept or skipped — merged at each session close
 * and loaded into every coaching prompt. Replaces reliance on the per-session
 * SessionSummary (which loaded only on a fresh session and could silently fail,
 * leaving the model with no memory of the user). A failed merge leaves the prior
 * value intact, so this column never regresses to amnesia.
 */
export class AddRelationshipMemory1781100000000 implements MigrationInterface {
    name = 'AddRelationshipMemory1781100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "relationship_memory" text
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "relationship_memory_updated_at" TIMESTAMP WITH TIME ZONE
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN IF EXISTS "relationship_memory_updated_at"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN IF EXISTS "relationship_memory"
        `);
    }
}
