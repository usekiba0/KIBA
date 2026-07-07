import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Test-mode revenue guard (Karibi 2026-07-08).
 *
 * The admin dashboard showed $60 MRR that turned out to be Stripe TEST-mode
 * conversions from testing — the MRR calc counted every `active` subscription
 * identically, with no way to tell test money from real money. This adds the
 * Stripe `livemode` flag per subscription so the dashboard can count only real
 * (live-key) revenue. NULL = legacy row created before we tracked it; the
 * dashboard treats NULL as real only when the app itself is on a live Stripe
 * key, so a test-key deployment reports $0 real MRR.
 */
export class AddSubscriptionLivemode1781300000000 implements MigrationInterface {
    name = 'AddSubscriptionLivemode1781300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "subscriptions"
            ADD COLUMN IF NOT EXISTS "livemode" boolean NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "livemode"
        `);
    }
}
