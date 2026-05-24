import { MigrationInterface, QueryRunner } from 'typeorm';

// Existing users (paid and unpaid) signed up before checkin_time was defaulted
// on cold inbound. Those rows have NULL, which makes scheduleCheckin early-
// return and leaves them silent forever. Backfill to 09:00 local so the daily
// loop has something to fire against once their Bull jobs are bootstrapped.
// Idempotent — WHERE filter skips rows that already have a value.
export class BackfillNullCheckinTimeTo9am1779600000000 implements MigrationInterface {
  name = 'BackfillNullCheckinTimeTo9am1779600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "users" SET "checkin_time" = '09:00' WHERE "checkin_time" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Intentional no-op: reverting would require knowing which rows we touched,
    // and setting everyone back to NULL would silently disable check-ins for
    // any user who'd subsequently chosen 09:00 deliberately.
  }
}
