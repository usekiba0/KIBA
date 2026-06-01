import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Per-day check-in dedup marker (bugfix 2026-06-01).
 *
 * The morning check-in was firing 2-3 times some mornings. Root cause: dedup
 * relied solely on Bull's deterministic jobId, but `removeOnComplete: true`
 * deletes that key the instant the job runs — so any of the OTHER schedulers
 * (boot bootstrap, hourly safety cron, the processor's own self-reschedule, or
 * scheduleOneShot which has no jobId) could recompute the same target minute
 * and re-enqueue a duplicate right at fire time.
 *
 * Fix: an application-level guard. `last_checkin_date` stores the user-LOCAL
 * calendar day (YYYY-MM-DD) of the last sent check-in; the processor claims the
 * day with a single atomic UPDATE ... WHERE last_checkin_date IS DISTINCT FROM
 * :today before sending, so only one job per local day can ever send.
 */
export class AddLastCheckinDate1780200000000 implements MigrationInterface {
    name = 'AddLastCheckinDate1780200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "last_checkin_date" varchar(10) NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN IF EXISTS "last_checkin_date"
        `);
    }
}
