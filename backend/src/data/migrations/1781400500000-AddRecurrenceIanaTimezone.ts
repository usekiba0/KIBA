import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `recurrence_iana_timezone` to scheduled_reminders. When set, each daily
 * occurrence recomputes the UTC offset live from this zone so a "daily 7am"
 * reminder stays at 7am across DST transitions, instead of drifting 1h off the
 * frozen recurrence_offset_minutes snapshot. Nullable; existing rows fall back
 * to the snapshot. Idempotent.
 */
export class AddRecurrenceIanaTimezone1781400500000 implements MigrationInterface {
    name = 'AddRecurrenceIanaTimezone1781400500000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "scheduled_reminders" ADD COLUMN IF NOT EXISTS "recurrence_iana_timezone" varchar(64)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "scheduled_reminders" DROP COLUMN IF EXISTS "recurrence_iana_timezone"`);
    }
}
