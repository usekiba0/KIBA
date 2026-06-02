import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Ad-attributed onboarding variants (2026-06-02).
 *
 * Different ad creatives ship different pre-filled SMS deep-link text (e.g.
 * "what even is kiba" vs "what's up kiba"). That text is the lead's first
 * inbound message; we classify it into a variant so each ad can open with a
 * different first reply while funnelling into the same intake → payment flow.
 *
 * Stored once at lead creation. Existing rows (organic / web signups) default to
 * 'standard'.
 */
export class AddOnboardingVariant1780300000000 implements MigrationInterface {
    name = 'AddOnboardingVariant1780300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "users_onboarding_variant_enum" AS ENUM ('standard', 'explainer', 'casual');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "onboarding_variant" "users_onboarding_variant_enum"
            NOT NULL DEFAULT 'standard'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN IF EXISTS "onboarding_variant"
        `);
        await queryRunner.query(`
            DROP TYPE IF EXISTS "users_onboarding_variant_enum"
        `);
    }
}
