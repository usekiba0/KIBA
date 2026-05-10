import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCheckinTimeToUsers1778400000000 implements MigrationInterface {
    name = 'AddCheckinTimeToUsers1778400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "checkin_time" character varying(5)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "checkin_time"`);
    }
}
