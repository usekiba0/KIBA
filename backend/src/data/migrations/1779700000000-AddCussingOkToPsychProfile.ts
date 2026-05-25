import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds the cussing consent flag to psychological_profiles. Default false — KIBA
 * never cusses unless the user explicitly opts in (asked during SMS onboarding:
 * "cussing — cool with it or keep it pg?"). Existing rows backfill to false so
 * established users don't suddenly start hearing language they never agreed to.
 */
export class AddCussingOkToPsychProfile1779700000000 implements MigrationInterface {
    name = 'AddCussingOkToPsychProfile1779700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "psychological_profiles"
              ADD COLUMN IF NOT EXISTS "cussing_ok" boolean NOT NULL DEFAULT false
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "psychological_profiles" DROP COLUMN IF EXISTS "cussing_ok"
        `);
    }
}
