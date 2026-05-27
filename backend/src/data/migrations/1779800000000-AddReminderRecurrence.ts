import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds recurrence to scheduled_reminders so the coaching AI can honor
 * "remind me every day at 8am"-style asks. The fire() worker creates a fresh
 * pending row each time a recurring reminder fires (preserves audit history),
 * with `recurrence_rule = 'daily'` and the same local time / offset carried
 * forward.
 *
 * Storage choice: we snapshot the user's UTC offset at create time rather than
 * reading user.utc_offset_minutes at fire time. Keeps behavior deterministic
 * for tests and makes "what time will this fire tomorrow" knowable from the
 * row alone. If the user moves timezones, they re-create the reminder.
 */
export class AddReminderRecurrence1779800000000 implements MigrationInterface {
    name = 'AddReminderRecurrence1779800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "scheduled_reminders"
            ADD COLUMN IF NOT EXISTS "recurrence_rule" varchar(20) NULL,
            ADD COLUMN IF NOT EXISTS "recurrence_local_time" varchar(5) NULL,
            ADD COLUMN IF NOT EXISTS "recurrence_offset_minutes" integer NULL,
            ADD COLUMN IF NOT EXISTS "recurrence_parent_id" uuid NULL
        `);
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_scheduled_reminders_recurrence_parent_id" ` +
            `ON "scheduled_reminders" ("recurrence_parent_id")`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_scheduled_reminders_recurrence_parent_id"`);
        await queryRunner.query(`
            ALTER TABLE "scheduled_reminders"
            DROP COLUMN IF EXISTS "recurrence_parent_id",
            DROP COLUMN IF EXISTS "recurrence_offset_minutes",
            DROP COLUMN IF EXISTS "recurrence_local_time",
            DROP COLUMN IF EXISTS "recurrence_rule"
        `);
    }
}
