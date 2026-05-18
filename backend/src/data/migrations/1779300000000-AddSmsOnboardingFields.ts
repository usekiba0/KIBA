import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds the columns needed to support SMS-first onboarding:
 *
 * - onboarding_stage: where the user is in the conversion funnel.
 *   'intake' = cold lead, AI is gathering info conversationally
 *   'payment_pending' = AI sent a Stripe payment link, waiting for them to pay
 *   'complete' = paid (via SMS link OR the existing web form)
 *
 * - intake_data: JSONB accumulator for fields the AI captures during chat
 *   (name, goal, fears, etc.). Once stage='complete' the AI may continue
 *   filling in fields opportunistically.
 *
 * - payment_link_sent_at: timestamp when AI sent the Stripe link. Drives
 *   the dunning auto-nudges (24h, 72h).
 *
 * - sample_coaching_given: bool. After payment_link is sent we give exactly
 *   ONE coaching reply before locking down to "complete payment first".
 *
 * - dunning_nudges_sent: smallint counter so we don't nudge the same user
 *   more than twice.
 *
 * Existing users are backfilled to 'complete' since they all went through
 * the web form before this column existed.
 */
export class AddSmsOnboardingFields1779300000000 implements MigrationInterface {
    name = 'AddSmsOnboardingFields1779300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "users_onboarding_stage_enum" AS ENUM('intake','payment_pending','complete');
            EXCEPTION WHEN duplicate_object THEN null; END $$;
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
              ADD COLUMN IF NOT EXISTS "onboarding_stage" "users_onboarding_stage_enum" NOT NULL DEFAULT 'complete'
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
              ADD COLUMN IF NOT EXISTS "intake_data" jsonb NOT NULL DEFAULT '{}'::jsonb
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
              ADD COLUMN IF NOT EXISTS "payment_link_sent_at" timestamptz NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
              ADD COLUMN IF NOT EXISTS "stripe_checkout_session_id" varchar(255) NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
              ADD COLUMN IF NOT EXISTS "sample_coaching_given" boolean NOT NULL DEFAULT false
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
              ADD COLUMN IF NOT EXISTS "dunning_nudges_sent" smallint NOT NULL DEFAULT 0
        `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_onboarding_stage" ON "users" ("onboarding_stage")`);

        // Relax NOT NULL on fields the web form used to require, so SMS-first
        // cold leads can be created without them and the AI fills them in over
        // chat. Existing users keep their values (they all have these set).
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "name" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "goals" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "coaching_focus" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_onboarding_stage"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "dunning_nudges_sent"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "sample_coaching_given"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "stripe_checkout_session_id"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "payment_link_sent_at"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "intake_data"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "onboarding_stage"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "users_onboarding_stage_enum"`);
    }
}
