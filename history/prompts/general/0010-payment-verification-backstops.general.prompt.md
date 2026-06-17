---
id: 0010
title: Deterministic payment-claim + entitlement backstops
stage: general
date: 2026-06-17
surface: agent
model: claude-opus-4-8
feature: none
branch: master
user: usekiba0
command: chat
labels: ["payment-verification", "entitlement", "billing", "bugfix", "phase1"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/messaging/coaching.processor.ts
 - backend/tests/unit/payment-claim.spec.ts
tests:
 - backend/tests/unit/payment-claim.spec.ts (24 pass)
 - full unit suite: 597 pass; only live-DB integration suite fails (expected)
 - tsc --noEmit clean
---

## Prompt

do #2 and #3

(Follow-up to PHR 0009. #2 = deterministic backstop so a not-yet-paid lead can't talk KIBA into believing they paid; #3 = close the legacy-backfill gap where COMPLETE users with no active subscription still got coaching.)

## Response snapshot

Verified the entitlement model first: both onboarding paths (SMS Stripe webhook + web-form/beta) create a TRIALING/ACTIVE subscription row at/before flipping onboarding_stage to COMPLETE, and the webhook saves the sub BEFORE the stage flip (no race). So the only COMPLETE users without a non-cancelled sub are backfilled-legacy (no row) or churned (CANCELLED). Safe to gate on that.

**#2 — intake payment-claim backstop** (coaching.processor.ts intake branch): added exported `PAYMENT_CLAIM_RE`. When a lead who already has the link (`payment_link_sent_at`) claims they paid, the system answers deterministically — first checks for an ACTIVE/TRIALING sub (rare lagged-webhook → "processing, give it a sec", no second link to avoid a double-charge), otherwise "not seeing it active yet, tap the link." The regex deliberately excludes the build-phase yes ("i'm in"/"ready"/"done") so it can't hijack the close.

**#3 — entitlement gate** (after correction trigger, before billing guard): COMPLETE users now need a non-cancelled sub (ACTIVE/TRIALING/PAST_DUE) to reach coaching; PAST_DUE stays in dunning grace; no-sub/cancelled-only divert to a fresh checkout link. The existing BILLING_INTENT guard now reuses `entitledSub` (no duplicate query) and only handles the PAST_DUE-asking-about-billing case.

Added payment-claim.spec.ts (24 cases incl. false-positive guards like "i want to get paid more at work"). tsc clean, 597 unit tests green.

## Outcome

- ✅ Impact: A lying lead can no longer get KIBA to act activated, and a never-paid/churned COMPLETE user can't chat their way into free coaching — both now verified against the subscriptions table, not the user's word or onboarding_stage alone.
- 🧪 Tests: payment-claim.spec 24/24; full unit suite 597 pass; only live-DB integration suite fails (env-gated, expected).
- 📁 Files: coaching.processor.ts (PAYMENT_CLAIM_RE, intake backstop, entitlement gate, billing-guard reuse), payment-claim.spec.ts (new).
- 🔁 Next prompts: deploy + watch entitlement_gate_diverted / intake_payment_claim_backstop logs; consider a one-time backfill to reconcile legacy COMPLETE-without-sub users.
- 🧠 Reflection: prompt rules (PHR 0009) reduce the behavior but only code gating against the subscription table makes "did they really pay" actually true.

## Evaluation notes (flywheel)

- Failure modes observed: trusting onboarding_stage as entitlement; trusting verbal payment claims; bare `\bpaid\b` regex false-positiving on "get paid more" (caught by test, tightened).
- Graders run and results (PASS/FAIL): unit suite PASS (597); integration FAIL (env-gated, expected).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): backfill job to set onboarding_stage off COMPLETE (or create proper subs) for the legacy backfilled users so they hit the gate cleanly.
