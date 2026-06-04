import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Night Recap dedup column (V1 spec PART 7), Phase 1.
 *
 * RecapService claims the user-local day on `last_recap_date` before each send,
 * mirroring `last_checkin_date`, so the nightly recap can't fire more than once
 * per local day no matter how many schedulers race at fire time.
 */
export class AddLastRecapDate1780500000000 implements MigrationInterface {
    name = 'AddLastRecapDate1780500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "last_recap_date" character varying(10)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN IF EXISTS "last_recap_date"
        `);
    }
}
