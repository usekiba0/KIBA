import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Weekly Review dedup column (2026-06-18 feedback batch — the 7-day mock's
 * one-week review). WeeklyReviewService claims the user-local day on
 * `last_weekly_review_date` before each send, mirroring `last_recap_date`, so the
 * weekly review can't fire more than once per week no matter how many schedulers
 * race at fire time.
 */
export class AddLastWeeklyReviewDate1781000000000 implements MigrationInterface {
    name = 'AddLastWeeklyReviewDate1781000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "last_weekly_review_date" character varying(10)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN IF EXISTS "last_weekly_review_date"
        `);
    }
}
