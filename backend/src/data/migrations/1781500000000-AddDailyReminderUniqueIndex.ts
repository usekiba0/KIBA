import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * One pending daily reminder per (user, local time) — Karibi 2026-07-08.
 *
 * The coaching model used to spawn a brand-new daily reminder chain every time
 * it set "remind me each morning", and each chain re-enqueues itself forever, so
 * redundant reminders stacked and all fired in the same morning window ("dozens
 * every morning"). ScheduleService.enqueue now dedups in application code, but a
 * partial UNIQUE index makes it airtight even if two app instances race.
 *
 * `up` first collapses any pre-existing duplicates (cancel all but the oldest
 * chain per slot) so the index can build on dirty data, then creates the index.
 * Cancelling the row is enough — the orphaned Bull job no-ops on the cancelled
 * row when it fires.
 */
export class AddDailyReminderUniqueIndex1781500000000 implements MigrationInterface {
    name = 'AddDailyReminderUniqueIndex1781500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Cancel every pending daily reminder that is NOT the oldest in its
        // (user, local time) slot.
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
                  AND (o."created_at" < s."created_at"
                       OR (o."created_at" = s."created_at" AND o."id" < s."id"))
              )
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_daily_reminder_one_pending_per_slot"
            ON "scheduled_reminders" ("user_id", "recurrence_local_time")
            WHERE "status" = 'pending' AND "recurrence_rule" = 'daily'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_daily_reminder_one_pending_per_slot"
        `);
    }
}
