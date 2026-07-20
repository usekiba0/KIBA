import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * One pending daily reminder per (user, local time, message) — Karibi 2026-07-08,
 * key widened to include the message 2026-07-16.
 *
 * The coaching model used to spawn a brand-new daily reminder chain every time
 * it set "remind me each morning", and each chain re-enqueues itself forever, so
 * redundant reminders stacked and all fired in the same morning window ("dozens
 * every morning"). ScheduleService.enqueue now dedups in application code, but a
 * partial UNIQUE index makes it airtight even if two app instances race.
 *
 * IMPORTANT: the key is (user, local time, MESSAGE), NOT (user, local time). A
 * user can legitimately have two different daily reminders at the same clock
 * time — e.g. an "8pm log dinner" and an "8pm walk/workout check-in". A time-only
 * key silently cancelled one of them (Karibi 2026-07-16 — "kiba stopped reminding
 * me to check in on my 8pm walks"). Keying on the message too lets distinct
 * reminders coexist while still collapsing a true duplicate. The message is
 * hashed (md5) so the btree index stays within its size limit for long text.
 *
 * `up` first collapses any pre-existing EXACT duplicates (cancel all but the
 * oldest chain per user/time/message slot) so the index can build on dirty data,
 * then creates the index. Cancelling the row is enough — the orphaned Bull job
 * no-ops on the cancelled row when it fires.
 */
export class AddDailyReminderUniqueIndex1781500000000 implements MigrationInterface {
    name = 'AddDailyReminderUniqueIndex1781500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Cancel every pending daily reminder that is NOT the oldest in its
        // (user, local time, message) slot. Same time + DIFFERENT message is a
        // distinct reminder and is left untouched.
        await queryRunner.query(`
            UPDATE "scheduled_reminders" s
            SET "status" = 'cancelled'
            WHERE s."status" = 'pending'
              AND s."recurrence_rule" = 'daily'
              AND s."recurrence_local_time" IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM "scheduled_reminders" o
                WHERE o."status" = 'pending'
                  AND o."recurrence_rule" = 'daily'
                  AND o."user_id" = s."user_id"
                  AND o."recurrence_local_time" = s."recurrence_local_time"
                  AND o."message" = s."message"
                  AND (o."created_at" < s."created_at"
                       OR (o."created_at" = s."created_at" AND o."id" < s."id"))
              )
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_daily_reminder_one_pending_per_slot"
            ON "scheduled_reminders" ("user_id", "recurrence_local_time", md5("message"))
            WHERE "status" = 'pending' AND "recurrence_rule" = 'daily'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_daily_reminder_one_pending_per_slot"
        `);
    }
}
