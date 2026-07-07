import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Cross-instance inbound idempotency for iMessage (Karibi 2026-07-08).
 *
 * The SMS path deduped inbound webhooks via the unique `twilio_sid`; the
 * SendBlue/iMessage path had no equivalent, so a re-delivered webhook (or two
 * instances racing) could spawn a second identical reply. This adds a unique
 * `provider_message_id` column that stores the SendBlue message_handle. The
 * inbound row is saved before any reply is generated, so the unique constraint
 * makes a duplicate webhook fail the insert (23505) and abort — atomic across
 * instances, unlike an in-memory guard.
 */
export class AddMessageProviderId1781400000000 implements MigrationInterface {
    name = 'AddMessageProviderId1781400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "messages"
            ADD COLUMN IF NOT EXISTS "provider_message_id" character varying(64)
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_messages_provider_message_id"
            ON "messages" ("provider_message_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_messages_provider_message_id"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN IF EXISTS "provider_message_id"`);
    }
}
