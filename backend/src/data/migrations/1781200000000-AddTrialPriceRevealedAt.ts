import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Day-7 price reveal (Karibi 2026-06-26).
 *
 * Timestamp of the one-time KIBA-voice message that reveals the price a few
 * hours before the trial charges ("you've been locked in a full week... keeping
 * this going is $20/month"). NULL = not yet revealed. Set when the message
 * sends; cleared at (re)activation so a re-subscribe re-arms it. Idempotency
 * guard for the `trial-price-reveal` accountability job.
 */
export class AddTrialPriceRevealedAt1781200000000 implements MigrationInterface {
    name = 'AddTrialPriceRevealedAt1781200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "trial_price_revealed_at" timestamptz NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN IF EXISTS "trial_price_revealed_at"
        `);
    }
}
