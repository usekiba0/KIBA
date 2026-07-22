import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Scheduled-sender visibility (Retraining doc B1, 2026-07-22).
 *
 * `scheduled_kind` tags an AI message row with the scheduled/triggered class
 * that produced it (checkin, recap, weekly_review, ghost, reminder, surprise,
 * dunning, intake_nudge, price_reveal, milestone). NULL for live coaching
 * replies and user rows. Seven sender classes previously persisted nothing —
 * their sends were invisible to the live coaching layer and the admin API, so
 * KIBA could not see (let alone own) its own scheduled messages.
 */
export class AddMessageScheduledKind1782000000000 implements MigrationInterface {
    name = 'AddMessageScheduledKind1782000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "messages"
            ADD COLUMN IF NOT EXISTS "scheduled_kind" varchar(32) NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "messages" DROP COLUMN IF EXISTS "scheduled_kind"
        `);
    }
}
