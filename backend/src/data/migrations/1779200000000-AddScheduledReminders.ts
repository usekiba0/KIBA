import { MigrationInterface, QueryRunner } from "typeorm";

export class AddScheduledReminders1779200000000 implements MigrationInterface {
    name = 'AddScheduledReminders1779200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "scheduled_reminders_status_enum" AS ENUM('pending','fired','cancelled','failed');
            EXCEPTION WHEN duplicate_object THEN null; END $$;
        `);
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "scheduled_reminders" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" uuid NOT NULL,
                "session_id" uuid NULL,
                "created_by_message_id" uuid NULL,
                "fire_at" timestamptz NOT NULL,
                "message" text NOT NULL,
                "bull_job_id" varchar(100) NULL,
                "status" "scheduled_reminders_status_enum" NOT NULL DEFAULT 'pending',
                "fired_at" timestamptz NULL,
                "failure_reason" text NULL,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT "PK_scheduled_reminders_id" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_scheduled_reminders_user_id" ON "scheduled_reminders" ("user_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_scheduled_reminders_status" ON "scheduled_reminders" ("status")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_scheduled_reminders_fire_at" ON "scheduled_reminders" ("fire_at")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "scheduled_reminders"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "scheduled_reminders_status_enum"`);
    }
}
