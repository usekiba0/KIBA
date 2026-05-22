-- Audit how many users were incorrectly backfilled to onboarding_stage='complete'
-- by migration 1779300000000 without ever actually paying.
--
-- Run this FIRST against the production DB and review the counts/samples before
-- running fix-onboarding-backfill.sql. The fix script will downgrade these users
-- to 'payment_pending' so the AI sends them a Stripe checkout link the next time
-- they text.
--
-- Active/trialing subscribers are NEVER touched — only users with no row in
-- `subscriptions`, or whose only subscription is cancelled/past_due, are at risk.

-- 1. Count of users that the fix would affect.
SELECT
  COUNT(*) AS would_downgrade,
  COUNT(*) FILTER (WHERE u.goals IS NOT NULL) AS with_legacy_goal,
  COUNT(*) FILTER (WHERE u.utc_offset_minutes IS NOT NULL) AS with_timezone,
  COUNT(*) FILTER (WHERE u.last_active_at > NOW() - INTERVAL '7 days') AS active_last_7d
FROM users u
WHERE u.onboarding_stage = 'complete'
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = u.id
      AND s.status IN ('active', 'trialing')
  );

-- 2. A sample of 20 affected users to eyeball (sorted by most recently active).
SELECT
  u.id,
  u.phone_number,
  u.name,
  u.status            AS user_status,
  u.onboarding_stage,
  u.registered_at,
  u.last_active_at,
  u.goals             AS legacy_goal,
  u.utc_offset_minutes,
  (
    SELECT s.status FROM subscriptions s
    WHERE s.user_id = u.id
    ORDER BY s.created_at DESC LIMIT 1
  ) AS latest_subscription_status
FROM users u
WHERE u.onboarding_stage = 'complete'
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = u.id
      AND s.status IN ('active', 'trialing')
  )
ORDER BY u.last_active_at DESC NULLS LAST
LIMIT 20;

-- 3. Sanity check: users that the fix will NOT touch (active/trialing subs).
SELECT
  COUNT(*) AS protected_users
FROM users u
WHERE u.onboarding_stage = 'complete'
  AND EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = u.id
      AND s.status IN ('active', 'trialing')
  );
