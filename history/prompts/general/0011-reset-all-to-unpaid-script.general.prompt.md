---
id: 0011
title: Reset all complete users to unpaid script
stage: general
date: 2026-06-17
surface: agent
model: claude-opus-4-8
feature: none
branch: master
user: usekiba0
command: chat
labels: ["billing", "subscription-reset", "one-off-script", "destructive", "phase1"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/scripts/reset-all-to-unpaid.ts
tests:
 - script type-checks clean (isolated tsc); not executed (mutates prod + sends real SMS)
---

## Prompt

mark all as incomplete and send an msg to them that we are reupdating the subscription plan so they are all under unpaid subscription

(Decisions via AskUserQuestion: scope = literally everyone COMPLETE; cancel their Stripe subs too; execution = my call.)

## Response snapshot

Flagged the risks (cuts off any real paying customers; Stripe billing mismatch if subs aren't also cancelled; mass outbound). Wrote a guarded one-off script `backend/scripts/reset-all-to-unpaid.ts` (matches the existing manual-send-link.ts NestFactory pattern). For every onboarding_stage='complete' user it: (1) cancels live Stripe subs (skips beta sub_beta_* ids), (2) marks local Subscription rows CANCELLED, (3) resets user to payment_pending + status cancelled + clears payment_link_sent_at/sample_coaching_given/intake_link_stall_turns (keeps name+goals so they re-enter the funnel cleanly, not full intake), (4) sends a one-time announcement.

Safety: DRY RUN by default; only mutates/sends with APPLY=1. Knobs: LIMIT (rehearse on N), SKIP_MESSAGE, SLEEP_MS throttle, MESSAGE override. Per-user try/catch + tallied stats.

NOT executed here — needs prod DB/Stripe/SMS creds; Karibi/Ryke runs it (dry run → LIMIT=3 → full APPLY) after approving the copy.

## Outcome

- ✅ Impact: Gives a reviewable, dry-run-first way to put all complete users back to unpaid under the new plan and notify them.
- 🧪 Tests: script type-checks clean; intentionally not run.
- 📁 Files: backend/scripts/reset-all-to-unpaid.ts.
- 🔁 Next prompts: run dry run in prod, confirm count + copy, then APPLY; afterwards verify a returning user hits the payment_pending → link funnel.
- 🧠 Reflection: pairs with the entitlement gate (PHR 0010) — the gate would catch these users lazily on next message anyway, but this proactively resets + announces.

## Evaluation notes (flywheel)

- Failure modes observed: literal "mark all" would have hit paying customers + left Stripe billing them — surfaced and confirmed scope before building.
- Graders run and results (PASS/FAIL): n/a (one-off ops script).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): if there ARE real payers, consider exempting active subs or sending a different (apologetic + comp) message to them.
