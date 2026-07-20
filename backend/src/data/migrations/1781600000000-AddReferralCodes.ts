import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Affiliate / referral codes — Karibi 2026-07-20, for the 20-user beta.
 *
 * Admin mints a code, a lead texts it during intake, and the checkout session is
 * created with the code's trial length instead of STRIPE_TRIAL_DAYS.
 *
 * Additive and safe on a live DB: one new table plus two nullable columns on
 * `users`. Nothing reads them unless a code is actually redeemed, so deploying
 * this before the admin UI exists is a no-op in production.
 */
export class AddReferralCodes1781600000000 implements MigrationInterface {
    name = 'AddReferralCodes1781600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "referral_codes" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "code" character varying(32) NOT NULL,
                "owner" character varying(120) NOT NULL,
                "trial_days" smallint NOT NULL DEFAULT 30,
                "max_redemptions" integer,
                "times_redeemed" integer NOT NULL DEFAULT 0,
                "active" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_referral_codes" PRIMARY KEY ("id")
            )
        `);

        // Codes are stored canonicalized (uppercase, no whitespace/dashes), so a
        // plain unique index is enough to stop two partners being handed the same
        // token.
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_referral_codes_code"
            ON "referral_codes" ("code")
        `);

        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "referral_code" character varying(32)
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "referral_trial_days" smallint
        `);
        // Attribution queries ("how many leads did partner X bring in") filter on
        // this; it's null for most rows, so the index stays small.
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_users_referral_code"
            ON "users" ("referral_code")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_referral_code"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "referral_trial_days"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "referral_code"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_referral_codes_code"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "referral_codes"`);
    }
}
