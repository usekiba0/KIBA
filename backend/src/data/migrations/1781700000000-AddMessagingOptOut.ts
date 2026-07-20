import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Messaging opt-out (STOP) — 2026-07-21, before the 20-user beta.
 *
 * KIBA had no opt-out path at all. On SMS the carrier intercepts STOP before it
 * reaches us, but iMessage — the primary channel — has no such filter, so a user
 * texting STOP kept receiving messages. Honoring it is a legal requirement.
 *
 * Additive and safe on a live DB: two nullable columns on `users`. Every
 * existing row gets NULL, which means "consented", so this deploys with no
 * behavior change until someone actually texts STOP.
 */
export class AddMessagingOptOut1781700000000 implements MigrationInterface {
    name = 'AddMessagingOptOut1781700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "opted_out_at" TIMESTAMP WITH TIME ZONE
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "opt_out_keyword" character varying(20)
        `);

        // Checked on every outbound send. Partial index: opted-out users are a
        // small minority, and the gate only ever asks "is this one of them".
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_users_opted_out_at"
            ON "users" ("opted_out_at")
            WHERE "opted_out_at" IS NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_opted_out_at"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "opt_out_keyword"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "opted_out_at"`);
    }
}
