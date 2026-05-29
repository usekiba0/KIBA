import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Tier 1 derived-signal schema.
 *
 * Per Karibi (2026-05-29): use compact computed columns instead of LLM-extracted
 * memory blobs. These four columns let us derive "Friday vanish mode" /
 * "second time with that excuse" / "celebrate the 7-day streak once" / etc.
 * without daily LLM extraction jobs.
 *
 * Also extends anti_ghost_states enum with GHOST_4/5/6 so the 6-level escalation
 * sequence (2h/5h/d2/d3/d5/d7 per V5 PART 8) can be tracked end-to-end.
 */
export class AddTier1AiDerivedSignals1780000000000 implements MigrationInterface {
    name = 'AddTier1AiDerivedSignals1780000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // miss_counts_by_dow[7] — Sun=0..Sat=6, in USER local time (computed from
        // task.scheduled_date - user.utc_offset_minutes at the moment of miss).
        // Drives V5 PART 5 predictive warnings without a separate pattern analyzer.
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "miss_counts_by_dow" integer[] NOT NULL DEFAULT '{0,0,0,0,0,0,0}',
            ADD COLUMN IF NOT EXISTS "last_milestone_hit" integer NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS "last_excuse_phrase" varchar(200) NULL,
            ADD COLUMN IF NOT EXISTS "same_excuse_count" integer NOT NULL DEFAULT 0
        `);

        // Extend ghost state enum with the 4th-6th escalation levels (d3, d5, d7).
        await queryRunner.query(`
            ALTER TYPE "anti_ghost_states_state_enum" ADD VALUE IF NOT EXISTS 'ghost_4'
        `);
        await queryRunner.query(`
            ALTER TYPE "anti_ghost_states_state_enum" ADD VALUE IF NOT EXISTS 'ghost_5'
        `);
        await queryRunner.query(`
            ALTER TYPE "anti_ghost_states_state_enum" ADD VALUE IF NOT EXISTS 'ghost_6'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users"
            DROP COLUMN IF EXISTS "same_excuse_count",
            DROP COLUMN IF EXISTS "last_excuse_phrase",
            DROP COLUMN IF EXISTS "last_milestone_hit",
            DROP COLUMN IF EXISTS "miss_counts_by_dow"
        `);
        // Postgres enums can't drop a value without recreating the type. We leave
        // the extra ghost_4/5/6 values in place on rollback — harmless since the
        // code branches reading them are also gone.
    }
}
