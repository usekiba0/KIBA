import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * USER_EMBARRASSMENT field (V5 spec, Karibi decision 2026-06-05), Phase 1.
 *
 * The private outcome the user would be most ashamed for people to see if they
 * keep failing. Collected ~week 2 via natural elicitation in coaching (not at
 * intake), so the column is nullable and empty for everyone until then.
 */
export class AddEmbarrassmentToProfile1780600000000 implements MigrationInterface {
    name = 'AddEmbarrassmentToProfile1780600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "psychological_profiles"
            ADD COLUMN IF NOT EXISTS "embarrassment" text
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "psychological_profiles" DROP COLUMN IF EXISTS "embarrassment"
        `);
    }
}
