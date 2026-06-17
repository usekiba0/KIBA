---
id: 0009
title: Intake resume not reset + verify payment
stage: general
date: 2026-06-17
surface: agent
model: claude-opus-4-8
feature: none
branch: master
user: usekiba0
command: chat
labels: ["intake", "session-continuity", "payment-verification", "bugfix", "phase1"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/messaging/coaching.processor.ts
 - backend/src/ai/prompts/intake.prompt.ts
 - backend/tests/unit/intake-prompt.spec.ts
tests:
 - backend/tests/unit/intake-prompt.spec.ts (15 pass)
 - full unit suite: 573 pass; only live-DB integration suite fails (expected)
 - tsc --noEmit clean
---

## Prompt

Client (Karibi) feedback relayed by Ryke, with a screenshot of an iMessage thread where KIBA re-greeted "what's your name tho?" after the user texted "Yo" (the lead had already gotten the payment link). Reported issues:
1. When KIBA texts a day/hours later it restarts the whole conversation — wants it to RESUME where they left off; before paying it should help/talk normally and memorize everything during the process.
2. It's asking about "an app".
3. It's denying reminders.
4. Texting "yo" reset the entire convo and re-started onboarding.
5. It's not reading whether the user really bought the plan — user lied that they paid and KIBA believed it.

## Response snapshot

Diagnosed via codebase recon. Issues 1 & 4 are ONE bug: `session-boundary.service.ts` expires a session after `SESSION_TIMEOUT_HOURS` (default 4h) and opens a fresh empty session; the processor then fetched intake history scoped to that empty session (`coaching.processor.ts:295`). Paid users carry a cross-session summary; intake users have none, so the intake AI got zero history and fell back to its cold opener.

Fixes:
- **Continuity (core):** intake routing now loads the lead's recent messages ACROSS sessions (last 20, by user_id) instead of session-scoped, so the build resumes exactly where it left off.
- **Payment verification:** added a CRITICAL RULE — payment is system-verified (Stripe webhook flips stage to COMPLETE); never accept a verbal "i paid", never congratulate/activate on their word.
- **No app:** added rule — KIBA is SMS-only, never ask about / reference a downloadable app.
- **Reminders:** reframed the intake reminder line from a denial to a "yes, that's literally my thing — activates the second you're in."
- Added 3 prompt-spec tests. tsc clean, 573 unit tests green.

## Outcome

- ✅ Impact: Returning leads (hours/days later, or a casual "yo") now resume their pre-pay conversation with full memory instead of restarting onboarding; KIBA no longer believes verbal payment claims, never references an app, and frames reminders as a yes.
- 🧪 Tests: intake-prompt.spec 15/15; full unit suite 573 pass; only live-DB integration suite fails (needs Postgres/Stripe — expected baseline).
- 📁 Files: coaching.processor.ts (cross-session intake history), intake.prompt.ts (3 new rules), intake-prompt.spec.ts (3 new tests).
- 🔁 Next prompts: deploy + watch a real returning-lead thread; consider same cross-session carryover audit for any other pre-COMPLETE path.
- 🧠 Reflection: The 4h session boundary is correct for coaching (summary carries context) but silently destructive for intake, which has no summary layer. Continuity for unpaid leads must not depend on the summary pipeline.

## Evaluation notes (flywheel)

- Failure modes observed: session-scoped history fetch + no intake summary = cold-opener re-greet on re-engagement; routing on onboarding_stage alone with no prompt rule against verbal payment claims.
- Graders run and results (PASS/FAIL): unit suite PASS (573); integration FAIL (env-gated, expected).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): if Haiku still occasionally opens cold with history present, tighten the opener block to gate on empty WHAT-YOU-KNOW rather than empty history.
