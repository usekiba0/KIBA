import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Payment-link safety-net counter (Karibi decision 2026-06-05), Phase 1.
 *
 * Counts intake turns where the full emotional build is captured
 * (name+goal+tz+why+obstacle) but the intake AI hasn't sent the payment link
 * yet. After a short grace the system force-sends, so a stalled model never
 * leaves a ready lead without a link — without firing before the emotional
 * close. Reset to 0 when the link is sent.
 */
export class AddIntakeLinkStallTurns1780700000000 implements MigrationInterface {
    name = 'AddIntakeLinkStallTurns1780700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "intake_link_stall_turns" smallint NOT NULL DEFAULT 0
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN IF EXISTS "intake_link_stall_turns"
        `);
    }
}
