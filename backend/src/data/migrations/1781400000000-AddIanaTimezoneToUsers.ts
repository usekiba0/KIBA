import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds the `iana_timezone` column (e.g. "America/Chicago") captured alongside
 * utc_offset_minutes when we know the user's city. Preferred for all
 * time-of-use reads because it is DST-correct year-round, whereas the frozen
 * smallint offset drifts 1h for half the year after each DST transition.
 *
 * Nullable and starts NULL for every existing user — consumers fall back to
 * utc_offset_minutes, so this is a zero-blast-radius migration. Idempotent.
 */
export class AddIanaTimezoneToUsers1781400000000 implements MigrationInterface {
    name = 'AddIanaTimezoneToUsers1781400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "iana_timezone" varchar(64)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "iana_timezone"`);
    }
}
