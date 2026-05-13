import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMessageFlags1778700000000 implements MigrationInterface {
    name = 'AddMessageFlags1778700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "is_checkin_prompt" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "is_proof_submission" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN IF EXISTS "is_proof_submission"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN IF EXISTS "is_checkin_prompt"`);
    }
}
