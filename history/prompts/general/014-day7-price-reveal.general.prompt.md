---
id: 014
title: Day-7 price reveal in KIBA's voice
stage: green
date: 2026-06-26
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: master
user: usekiba0
command: general
labels: ["trial", "billing", "monetization", "scheduled-message", "client-feedback"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/accountability/checkin.processor.ts
 - backend/src/onboarding/stripe-webhook.controller.ts
 - backend/src/onboarding/onboarding.module.ts
 - backend/src/data/entities/user.entity.ts
 - backend/src/data/migrations/1781200000000-AddTrialPriceRevealedAt.ts
 - backend/tests/unit/checkin.processor.spec.ts
 - backend/tests/unit/stripe-reactivation.spec.ts
 - backend/tests/unit/stripe-goal-bridge.spec.ts
 - docs/REGRESSION_CHECKLIST.md
tests:
 - tests/unit/checkin.processor.spec.ts (handleTrialPriceReveal guards + buildTrialPriceReveal copy)
 - tests/unit/stripe-reactivation.spec.ts (reveal scheduled + flag re-armed at activation)
 - full unit run: 789 passed, tsc clean
---

## Prompt

build it now , free vs paid mdule is for pahse 2.5 or will be treated as a CR

## Response snapshot

Built the day-7 price reveal (the open item from the prior turn); confirmed the
free/paid inversion stays out of scope (Phase 2.5 / CR).

- New `trial-price-reveal` accountability job: `CheckinProcessor.handleTrialPriceReveal`
  + pure `buildTrialPriceReveal`. Sends ONE KIBA-voice message framing the price
  as the next step after a week of value ("you've been locked in a full week...
  keeping this going is $20/month, less than two doordash orders"), personalised
  with their goal. Guards: skips churned (CANCELLED) / unactivated / crisis users;
  idempotent via new `user.trial_price_revealed_at`.
- Scheduled at activation (checkout.session.completed) to fire ~4h before the real
  Stripe `trial_end`; jobId keyed on the sub id (re-delivered webhook = no-op);
  flag cleared at (re)activation so a re-subscribe re-arms.
- De-robotized the two conflicting lifecycle SMS: day-4 `trial_will_end` no longer
  quotes price / "no action needed" (would pre-empt the reveal); post-charge
  `trial_ended` is now a short KIBA-voice confirmation.
- Migration 1781200000000 (ADD COLUMN trial_price_revealed_at). OnboardingModule
  registers the accountability queue so the webhook can enqueue.

Committed f405117 to master, pushed (deploy includes the migration; runs on boot).
789 unit pass, tsc clean. Checklist A25 + B10.

## Outcome

- ✅ Impact: price now lands on day 7 as a value moment in KIBA's voice, a few
  hours before the charge — no surprise bill, no SaaS "trial ends" notice.
- 🧪 Tests: +7; 789 unit pass; tsc clean.
- 📁 Files: checkin.processor.ts, stripe-webhook.controller.ts, onboarding.module.ts,
  user.entity.ts, new migration, 3 specs, checklist.
- 🔁 Next prompts: free/paid inversion is a CR (Phase 2.5); web-search/live-info is
  Phase 2. Pre-existing double activation SMS (checkout.session.completed sends
  "you're in" AND customer.subscription.created sends "coaching is active 💪") and
  the still-robotic subscription_active/cancelled offboarding lines could be
  cleaned up if Karibi wants.
- 🧠 Reflection: used the real Stripe trial_end rather than a fixed delay so the
  timing tracks the actual charge; idempotency flag on the user keeps the job
  safe under webhook re-delivery and re-subscribe.

## Evaluation notes (flywheel)

- Failure modes observed: existing lifecycle SMS were robotic/off-brand and the
  day-4 "no action needed" notice would have pre-empted the day-7 price moment.
- Graders run and results (PASS/FAIL): unit suite PASS (789/789), tsc PASS.
- Prompt variant (if applicable): n/a (deterministic copy, not LLM).
- Next experiment (smallest change to try): shorten STRIPE_TRIAL_DAYS on a test
  number to watch the reveal fire end-to-end (B10).
