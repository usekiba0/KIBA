-- Fix the over-aggressive backfill from migration 1779300000000.
--
-- For every user currently at onboarding_stage='complete' who has NO
-- active/trialing subscription row, this:
--   1. Copies users.goals into intake_data.goal_description (so the
--      send_payment_link handler doesn't refuse for missing intake — name
--      is already on the user row, and tz can be re-asked by the AI if null).
--   2. Flips onboarding_stage to 'payment_pending' so the next inbound
--      message routes to the intake AI, which already knows how to send
--      the Stripe link.
--
-- RUN audit-onboarding-backfill.sql FIRST and confirm the counts look sane
-- before running this. Wrapped in BEGIN/COMMIT so you can BEGIN; <run>;
-- ROLLBACK; for a final dry-run on production if you want.

BEGIN;

-- 1. Backfill goal_description into intake_data for affected users that
-- still have the legacy `goals` column populated and don't already have it.
UPDATE users u
SET intake_data = COALESCE(u.intake_data, '{}'::jsonb)
                || jsonb_build_object('goal_description', u.goals)
WHERE u.onboarding_stage = 'complete'
  AND u.goals IS NOT NULL
  AND (u.intake_data ->> 'goal_description') IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = u.id
      AND s.status IN ('active', 'trialing')
  );

-- 2. Downgrade to payment_pending. Resets the dunning counter and
-- payment_link_sent_at so the AI can immediately send a fresh link
-- without the 5-minute cooldown firing.
UPDATE users u
SET onboarding_stage     = 'payment_pending',
    payment_link_sent_at = NULL,
    sample_coaching_given = false,
    dunning_nudges_sent  = 0
WHERE u.onboarding_stage = 'complete'
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = u.id
      AND s.status IN ('active', 'trialing')
  );

-- Verify how many we touched. Commit if it matches the audit count.
SELECT COUNT(*) AS now_payment_pending
FROM users
WHERE onboarding_stage = 'payment_pending';

COMMIT;
