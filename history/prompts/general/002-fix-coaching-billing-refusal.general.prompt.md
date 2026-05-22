---
id: 002
title: Fix coaching AI refusing subscription payment requests
stage: general
date: 2026-05-22
surface: agent
model: claude-opus-4-7
feature: none
branch: master
user: usekiba0
command: general
labels: [bug, onboarding, stripe, coaching, sms, prompt]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/messaging/coaching.processor.ts
 - backend/src/ai/coaching.service.ts
 - backend/src/ai/prompts/coaching.prompt.ts
 - backend/scripts/audit-onboarding-backfill.sql
 - backend/scripts/fix-onboarding-backfill.sql
 - backend/scripts/manual-send-link.ts
tests:
 - tsc --noEmit (src/ clean; 9 pre-existing test-mock errors unchanged)
---

## Prompt

Production log paste (verbatim, abridged for length):

> [Nest] LOG [MessagingController] [SendBlue] Raw webhook payload: {"content":"I want to pay for a subscription with you. Send me the link.", "from_number":"+18325604035", "to_number":"+14695634418", ...}
>
> [Nest] LOG [CoachingService] coaching_reply userId=ba2b8110-dcf4-4a99-9680-80f7b0b9b05e
>
> [Nest] LOG [MessagingService] [SendBlue] Send response: "hey, i'm not a subscription service — i'm your accountability partner. i text you, remind you, push you on your goals, that kind of thing. if your question is about how to work with me or what the setup looks like, that's a conversation to have with whoever brought you on board (your coach, your program, etc). they'd handle the payment side. what are we actually working on right now?"

User wants the bug fixed, the broken backfill cleaned up, and the affected user (ba2b8110-...) sent a link manually.

## Response snapshot

Diagnosed three compounding causes:

1. coaching.processor.ts:197 routes all `onboarding_stage === COMPLETE` users to the coaching LLM.
2. Migration 1779300000000-AddSmsOnboardingFields backfilled every existing user row to `'complete'`, regardless of actual Stripe payment status.
3. The coaching path (coaching.service.ts) only exposed `schedule_reminder` and `list_my_reminders` tools — no `send_payment_link` — and `coaching.prompt.ts` never told Claude it CAN handle billing, so it freelanced a refusal.

Fix shipped (tool + keyword guard + backfill cleanup + hot-fix script per user's selection):

- `sendPaymentLink` refactored to accept `{ requireFullIntake: boolean }` so re-subscribe paths skip the intake-completeness check (legacy backfilled users have `name` but no `intake_data.goal_description`).
- `send_payment_link` tool exposed to the coaching LLM via `CoachingToolHandlers.sendPaymentLink` + `SEND_PAYMENT_LINK_TOOL` (description updated for the coaching context, forbidding the "i'm not a subscription service" pattern). Handler queries `subscriptions` for ACTIVE/TRIALING — returns ok:false with "user already has active subscription" so the AI can offer to escalate instead of double-charging.
- Coaching system prompt got a CAPABILITY line covering billing/subscription asks and the explicit forbidden pattern.
- `BILLING_INTENT_RE` regex guard added in the COMPLETE branch: matches `subscribe`, `subscription`, `payment link`, `pay me/the/for`, `checkout`, `billing`, `stripe`, `membership`, `signup`. If the user has no active/trialing sub, short-circuit straight to `sendPaymentLink({ requireFullIntake: false })` — the LLM never sees the message.
- Backfill cleanup: `backend/scripts/audit-onboarding-backfill.sql` (read-only audit with counts + 20-row sample + protected-users sanity check) and `backend/scripts/fix-onboarding-backfill.sql` (copies `users.goals` → `intake_data.goal_description`, flips stage to `payment_pending`, resets dunning counter; wrapped in BEGIN/COMMIT so it can be dry-run via ROLLBACK).
- Hot-fix script `backend/scripts/manual-send-link.ts` — boots a `NestApplicationContext`, calls `CoachingProcessor.sendPaymentLink` (private, via cast escape hatch) with `requireFullIntake:false` for `USER_ID=ba2b8110-...`. Aborts safely if that user is already on an active/trialing subscription.

## Outcome

- ✅ Impact: Coaching LLM can now handle "send me the payment link" / "I want to subscribe" without refusing. Backfilled legacy users get the link via the regex guard even before the LLM responds. Audit script lets the operator verify the blast radius before flipping ~N user rows.
- 🧪 Tests: tsc --noEmit on tsconfig.build.json passes clean; on the full tsconfig.json the same 9 pre-existing test-file errors remain (unrelated — test mocks are stale vs. recent User-entity changes). Did not write new unit tests this round — the failure pattern is observable in production logs and the new code paths are mostly thin glue.
- 📁 Files: 3 modified (coaching.processor.ts, coaching.service.ts, coaching.prompt.ts), 3 new in backend/scripts/.
- 🔁 Next prompts: run audit SQL on Render Postgres → review counts → run fix SQL → run manual-send-link.ts for ba2b8110-... → deploy code changes. Optionally: refresh the unit-test mocks to include the new User columns so the suite goes back to green.
- 🧠 Reflection: The original commit 0106f1c chose "default 'complete'" for the new column to keep the web-form flow working. That was the right call for live paying customers but assumed all legacy users were paid; the assumption wasn't checked against `subscriptions.status`. A safer default would have been to backfill only users WHERE EXISTS active subscription, and leave the rest at `payment_pending`. Worth noting for future migrations that gate behaviour on payment state.

## Evaluation notes (flywheel)

- Failure modes observed: AI fabricated a third-party "your coach / program" entity to deflect a billing ask — classic over-restrictive persona + missing-capability hallucination. Same shape as the earlier 7e20ed5 / cd317b1 fixes ("not a coach", workout plans). Pattern: any time we add a feature behind a tool, the prompt also has to explicitly state the capability or Claude will refuse it from persona inertia.
- Graders run and results (PASS/FAIL): n/a — no automated grader for billing-intent yet. Candidate prompt eval: 10 hand-written user messages (5 billing-ask, 5 non-billing) → assert the billing-ask responses either call send_payment_link or, for active subs, mention support/escalation. Worth adding before the next prompt change.
- Prompt variant (if applicable): coaching.prompt v2 (BILLING capability block added).
- Next experiment (smallest change to try): once a few real users hit the new path, sample 5-10 transcripts where send_payment_link was called via the LLM (not the regex guard) — confirm the AI's confirmation line stays one sentence and doesn't re-explain the product. If it gets chatty, tighten the description in SEND_PAYMENT_LINK_TOOL.
