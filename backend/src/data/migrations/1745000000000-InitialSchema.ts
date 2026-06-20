import { MigrationInterface } from 'typeorm';

/**
 * NO-OP (neutralised 2026-06-20).
 *
 * This was the legacy RYKE-AI baseline — it created users / subscriptions /
 * conversation_sessions / messages / nutritional_analyses / crisis_alerts /
 * session_summaries / processed_stripe_events. But the KIBA rebuild,
 * AddKibaAccountabilitySchema1778277013568, is a COMPLETE superset baseline that
 * independently creates every one of those tables (plus the KIBA-specific ones).
 *
 * Running both on a fresh database collided ('relation "users" already exists'),
 * which broke `migration:run` on any from-scratch DB — CI, fresh staging, and
 * disaster-recovery rebuilds. No later migration depends on this one's objects
 * (they all build on the KIBA baseline), so it is pure dead weight.
 *
 * Emptied to remove the conflict. Safe in every case:
 *  - Databases where it already ran (prod) have it recorded; it never re-runs.
 *  - On a fresh DB it now does nothing and AddKiba builds the real schema.
 * No data or schema change results either way. Kept (not deleted) so the
 * recorded migration name still resolves cleanly.
 */
export class InitialSchema1745000000000 implements MigrationInterface {
  name = 'InitialSchema1745000000000';

  public async up(): Promise<void> {
    // intentionally empty — superseded by AddKibaAccountabilitySchema1778277013568.
  }

  public async down(): Promise<void> {
    // intentionally empty — see file header.
  }
}
