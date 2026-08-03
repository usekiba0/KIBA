import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Persist the WHOLE attachment batch of a turn (Karibi 2026-08-03 — "when u send
 * KIBA multiple pics it only reads one").
 *
 * A multi-photo send arrives as one webhook per photo; the debouncer merges them
 * into a single turn. The turn itself now reads every photo (see
 * messaging/inbound-media.ts), but the row it was saved to had exactly one
 * `media_url` / `media_content_type` column pair, so photos 2..N were dropped at
 * the DB boundary. That made the fix half-true: KIBA saw all the photos while
 * replying, then a minute later — asked "what about the other pic" — photo
 * recall could only find the first one, and the admin thread view showed a
 * single image for a turn that carried four.
 *
 * `media_urls` / `media_content_types` hold the full ordered batch. The two
 * singular columns are KEPT and still written with entry [0]: every existing row
 * has them, several read paths and the admin API still use them, and dropping
 * them would be a breaking change for no gain. New rows populate both shapes;
 * readers that want the batch use the arrays and fall back to the singular pair
 * for historical rows, which is exactly what image-recall does.
 *
 * Backfill is deliberate and lossless: for every legacy row that has a
 * media_url, seed the arrays with that single entry so readers never have to
 * special-case "array is NULL but a photo exists".
 */
export class AddMessageMediaBatch1782200000000 implements MigrationInterface {
    name = 'AddMessageMediaBatch1782200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "messages"
            ADD COLUMN IF NOT EXISTS "media_urls" jsonb NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "messages"
            ADD COLUMN IF NOT EXISTS "media_content_types" jsonb NULL
        `);
        // Legacy rows: one attachment each. Seeding them keeps every reader on
        // the array path instead of branching on NULL.
        await queryRunner.query(`
            UPDATE "messages"
            SET "media_urls" = jsonb_build_array("media_url"),
                "media_content_types" = jsonb_build_array(COALESCE("media_content_type", ''))
            WHERE "media_url" IS NOT NULL AND "media_urls" IS NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "messages" DROP COLUMN IF EXISTS "media_content_types"
        `);
        await queryRunner.query(`
            ALTER TABLE "messages" DROP COLUMN IF EXISTS "media_urls"
        `);
    }
}
