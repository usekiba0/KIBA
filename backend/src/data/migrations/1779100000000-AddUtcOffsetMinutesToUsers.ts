import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds the `utc_offset_minutes` column that the timezone PR (commit dfe0276)
 * introduced on the User entity but never shipped a migration for. Prod webhooks
 * have been failing with "column User.utc_offset_minutes does not exist" because
 * TypeORM tries to SELECT this column on every inbound message.
 *
 * Idempotent so it's safe to re-run on environments where the column was
 * previously added manually.
 */
export class AddUtcOffsetMinutesToUsers1779100000000 implements MigrationInterface {
    name = 'AddUtcOffsetMinutesToUsers1779100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "utc_offset_minutes" smallint`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "utc_offset_minutes"`);
    }
}
