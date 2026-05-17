import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCorrectionsAndKnowledge1779000000000 implements MigrationInterface {
    name = 'AddCorrectionsAndKnowledge1779000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "coaching_knowledge" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "title" varchar(200) NOT NULL,
                "content" text NOT NULL,
                "source_correction_id" uuid NULL,
                "active" boolean NOT NULL DEFAULT true,
                "created_by" varchar(100) NOT NULL,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT "PK_coaching_knowledge_id" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_coaching_knowledge_active" ON "coaching_knowledge" ("active")`);

        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "corrections_status_enum" AS ENUM('pending','accepted','appended','rejected');
            EXCEPTION WHEN duplicate_object THEN null; END $$;
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "corrections" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" uuid NOT NULL,
                "triggering_message_id" uuid NULL,
                "correction_text" text NOT NULL,
                "ai_analysis" text NULL,
                "ai_validity_score" smallint NULL,
                "ai_suggested_knowledge" text NULL,
                "status" "corrections_status_enum" NOT NULL DEFAULT 'pending',
                "knowledge_id" uuid NULL,
                "admin_note" text NULL,
                "reviewed_by" varchar(100) NULL,
                "reviewed_at" timestamptz NULL,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT "PK_corrections_id" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_corrections_user_id" ON "corrections" ("user_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_corrections_status" ON "corrections" ("status")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_corrections_created_at" ON "corrections" ("created_at")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "corrections"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "corrections_status_enum"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "coaching_knowledge"`);
    }
}
