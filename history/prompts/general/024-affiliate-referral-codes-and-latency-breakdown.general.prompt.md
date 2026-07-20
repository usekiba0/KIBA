---
id: 024
title: Affiliate referral codes + latency breakdown
stage: green
date: 2026-07-20
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: fix/queue-drain-and-reminder-dedup
user: usekiba0
command: (chat) do whats best
labels: ["referral-codes","affiliate","admin","stripe-trial","latency","instrumentation","beta-launch"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/data/entities/referral-code.entity.ts (new)
 - backend/src/data/referral.service.ts (new)
 - backend/src/data/migrations/1781600000000-AddReferralCodes.ts (new)
 - backend/src/data/entities/user.entity.ts (referral_code, referral_trial_days)
 - backend/src/data/data.module.ts (entity + provider + export)
 - backend/src/data/data-source.ts (entity registration)
 - backend/src/data/admin.controller.ts (3 referral-code endpoints + DTOs)
 - backend/src/messaging/coaching.processor.ts (REFERRAL_CODE_RE, redemption guard, trial override, bypassRateLimit, latency breakdown)
 - backend/src/messaging/message-debouncer.service.ts (firstPushAt → receivedAt)
 - frontend/src/app/admin/page.tsx (Referrals tab)
 - backend/tests/unit/referral-code.spec.ts (new)
tests:
 - backend unit suite — 933/933 pass (74 suites), tsc clean
 - tests/unit/referral-code.spec.ts — 20 new assertions
---

## Prompt

do whats best

(Following a triage of the Karibi/Sumair call action items — see PHR 023.)

## Response snapshot

Picked the two pre-Monday items that don't need a decision from the client, and left the ones that do.

**1. Latency — measured before cutting.** PHR 019's stated next experiment was "instrument real TTFB before touching debounce/tool-loop"; did that instead of guessing at 2-3 seconds.
- `MessageDebouncerService` now records `firstPushAt` per buffer and passes it to the processor as `receivedAt`. `dateSent` was unusable for this (sender's clock, skewed on iMessage) and `turnStart` is already past the debounce window, so neither showed the wait the user actually feels.
- `turn_latency` now logs `debounceMs` / `genMs` / `sendMs` / `totalMs` / `e2eMs` on all three paths (intake, vision, text). "8-10 seconds" is not actionable until we know which of the three owns it.
- One real cut shipped: the `token_count` bookkeeping write was `await`ed in FRONT of `saveAndSend` on the text and vision paths. Now it runs alongside the send and is awaited after — one DB round-trip off time-to-first-bubble.
- Finding worth reporting: debounce is only 1.5s text / 3.0s image, so it cannot be where 8-10s lives. `MESSAGE_BUBBLE_DELAY_MS` (1200ms × bubbles-1) is a bigger suspect than it looks and `sendMs` will now prove it either way.
- Read receipts (Karibi's "so users don't think they're ignored") were already built — `messaging.service.ts:173`, fired from the webhook. They need SendBlue support to ACTIVATE them on the account; the endpoint 200s silently until then.

**2. Affiliate / referral codes.** Deliberately NOT Stripe promotion codes: checkout already sets `allow_promotion_codes: true`, but the ask was an admin-panel feature with attribution, and Stripe promo codes can't be minted or counted from our dashboard — and our leads redeem mid-SMS, before they ever reach the checkout page.
- `ReferralCode` entity: code (canonicalized uppercase, unique), owner, per-code `trial_days`, optional `max_redemptions`, `times_redeemed`, `active`.
- `users.referral_code` + `users.referral_trial_days` — the granted length is FROZEN at redemption so an admin editing a code later can't shorten a trial a lead was already promised.
- `ReferralService.redeem` is transactional with a `pessimistic_write` lock on the code row, so two leads racing for the last slot of a capped code can't both win. Idempotent per user; a second, different code is refused rather than stacked.
- SMS redemption is a deterministic guard ahead of the intake LLM (the model has no tool for this and would otherwise promise a free month it can't grant). `REFERRAL_CODE_RE` is intentionally loose, because the guard only ACTS on a token that resolves to a real code and otherwise falls through in silence — a false positive on "the code is broken" costs nothing, whereas telling someone their nonexistent code is invalid is confusing.
- If the lead already holds a checkout link minted at the old trial length, redemption re-sends a fresh one via a new `bypassRateLimit` option on `sendPaymentLink` — making them wait out the 5-minute anti-spam limiter for a trial they were just promised is worse than the spam it guards against.
- Admin: `GET/POST /admin/referral-codes` + `PATCH /admin/referral-codes/:id/active`, behind the existing `InternalApiKeyGuard`. List joins `users` live for per-code signups/paid attribution. `trial_days` capped at 365 — a typo'd 3650 would hand out a decade of free product with no clawback from an already-created Stripe sub.
- Frontend Referrals tab in the admin dashboard (mint form + list + activate/deactivate toggle).

## Outcome

- ✅ Impact: beta can hand out codes on Monday; latency now has a real per-stage breakdown instead of a single number.
- 🧪 Tests: 933/933 unit pass (74 suites), tsc clean on backend. 20 new assertions in `referral-code.spec.ts`.
- ⚠️ Not committed — left in the working tree pending the user's go-ahead.
- 🔁 Next prompts: (a) monthly-vs-yearly on checkout needs a product decision — Stripe Checkout can't show a price toggle in one subscription session, so it's two links or a Stripe Pricing Table; (b) does redeeming a code still collect a card, or are the 20 beta users fully comped? Current build = 30-day `trial_period_days`, card still collected; (c) PR #14 still unmerged and these changes stack on its branch.
- 🧠 Reflection: the honest latency finding is that the debounce window everyone assumed was the culprit is only 1.5s. Shipping instrumentation instead of a guessed reduction avoids reversing the bubble-split fix for nothing.

## Evaluation notes (flywheel)

- Failure modes observed: `token_count` write serialized in front of the first bubble; no measurement of the debounce slice at all.
- Graders run and results (PASS/FAIL): unit suite PASS (933/933), tsc PASS.
- Prompt variant (if applicable): none — deterministic guard, no prompt change.
- Next experiment (smallest change to try): read one day of prod `turn_latency` logs and see whether `genMs` or `sendMs` dominates before touching either.
