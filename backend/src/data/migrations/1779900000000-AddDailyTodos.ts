import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Editable per-day to-do list. Distinct from `daily_tasks` (which holds the
 * singular proof-bound headline task each day). The coaching AI seeds this on
 * first user message of the day from goal.action_plan.daily_tasks, surfaces
 * it in every prompt, and can add/mark-done via tools.
 */
export class AddDailyTodos1779900000000 implements MigrationInterface {
    name = 'AddDailyTodos1779900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "daily_todos_status_enum" AS ENUM('open','done','skipped');
            EXCEPTION WHEN duplicate_object THEN null; END $$;
        `);
        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "daily_todos_source_enum" AS ENUM('plan','user','ai');
            EXCEPTION WHEN duplicate_object THEN null; END $$;
        `);
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "daily_todos" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" uuid NOT NULL,
                "scheduled_date" date NOT NULL,
                "content" text NOT NULL,
                "status" "daily_todos_status_enum" NOT NULL DEFAULT 'open',
                "source" "daily_todos_source_enum" NOT NULL DEFAULT 'user',
                "completed_at" timestamptz NULL,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT "PK_daily_todos_id" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_daily_todos_user_date" ` +
            `ON "daily_todos" ("user_id", "scheduled_date")`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_daily_todos_user_date"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "daily_todos"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "daily_todos_source_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "daily_todos_status_enum"`);
    }
}
