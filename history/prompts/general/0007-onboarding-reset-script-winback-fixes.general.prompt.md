---
id: 0007
title: Onboarding reset + script + win-back fixes
stage: green
date: 2026-06-10
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: feat/multi-goal-pipeline
user: usekiba0
command: (chat) client bug batch — Phase 1 only
labels: ["onboarding","intake","phone-normalization","conversion","win-back","trial","phase-1"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/common/phone.ts (new)
 - backend/src/messaging/coaching.processor.ts
 - backend/src/ai/prompts/intake.prompt.ts
 - backend/src/ai/prompts/winback.prompt.ts (new)
 - backend/src/ai/coaching.service.ts
 - backend/src/accountability/checkin.processor.ts
 - backend/src/accountability/accountability.module.ts
 - backend/.env
 - backend/.env.example
 - backend/src/app.module.ts
 - backend/src/onboarding/onboarding.service.ts
 - backend/tests/unit/phone.spec.ts (new)
 - backend/tests/unit/checkin.processor.spec.ts
 - backend/tests/unit/checkin-resilience.spec.ts
tests:
 - backend/tests/unit (55 suites / 529 tests) — all green
 - npx tsc --noEmit — clean
 - npx nest build — exit 0
---

## Prompt

Client (still Phase 1) shared a batch of bugs/changes via the KIBA V1 Onboarding & Accountability
Framework PDF, the KIBA Niche & Capability Framework PDF, a 7-day mock conversation, plus two iMessage
screenshots. Reported issues: (1) KIBA "just follows a script", re-saying the same lines and not
answering direct questions like "how u gonna help me"; (2) the conversation "keeps resetting" — a
returning user texting again gets restarted from "what's your name tho?", losing their name/state;
(3) re-asks "what city are you in?" after already saying Houston; (4) drops a Stripe checkout link
when the user asked it to "explain first" (money-hungry); (5) the win-back message ("ngl Karibi —
good thing you haven't fully locked in yet... 30 days free") is identical for everyone — client wants
it auto-generated; (6) trial copy says 30 days, should be 7. Guardrail: stay strictly in Phase 1, nothing
out of scope. Client decisions: trial = 7 days; win-back = LLM-generated per user; tone stays opt-in
(KIBA asks PG vs cussing). Note: the 7-day SMS challenge is an agreed paid add-on (extra cost).

## Response snapshot

Root-caused all six via read-only Explore agents, then fixed:
1. RESET (master bug): no phone normalization — SendBlue's looser number format missed the existing
   E.164 row, creating a fresh INTAKE lead. Added common/phone.ts (normalizePhoneNumber → E.164) and
   normalized `from` at the top of CoachingProcessor.process().
2. SCRIPT/ANSWER-FIRST: added an "ANSWER DIRECT QUESTIONS FIRST — overrides the build sequence" block
   to intake.prompt.ts (answer → help → tie back; ban "not my lane"; never re-ask known fields).
3. CITY RE-ASK: deterministic parseCityOffset already captured Houston; the re-ask was prompt
   adherence — fixed by the same "never re-ask WHAT YOU KNOW" rule.
4. PREMATURE LINK: added EXPLAIN_REQUEST_RE; force-link safety-net now suppressed (and stall counter
   reset) when the user is asking to understand. Explicit link requests still send.
5. WIN-BACK: new winback.prompt.ts + CoachingService.generateWinbackNudge() (single tool-less LLM
   call, ≤3×/lead); checkin.processor uses it with buildDunningNudge as deterministic fallback.
6. TRIAL = 7: .env / .env.example 30→7; aligned app.module + onboarding.service defaults (were 30).

## Outcome

- ✅ Impact: returning users no longer reset; KIBA answers questions instead of looping the script;
  no link dropped mid-"explain"; win-back is personalised per user; all trial copy says 7 days.
- 🧪 Tests: 55 suites / 529 unit tests green; tsc clean; nest build exit 0. Added phone.spec.ts (7).
- 📁 Files: 9 edited, 3 new (phone.ts, winback.prompt.ts, phone.spec.ts).
- 🔁 Next prompts: optional — make paid-user anti-ghost (buildGhostMessage) LLM-generated too (cost
  tradeoff: higher frequency); web-form/admin multi-goal UI still deferred.
- 🧠 Reflection: the "reset" was the master bug — it manufactured the "same lines for everyone" feel
  because every re-text started onboarding from zero.

## Evaluation notes (flywheel)

- Failure modes observed: rigid prompt sequence overriding user intent; no inbound phone canonicalization;
  deterministic force-net ignoring conversational context.
- Graders run and results (PASS/FAIL): unit suite PASS (529/529).
- Prompt variant (if applicable): intake.prompt.ts answer-first block; winback.prompt.ts new.
- Next experiment (smallest change to try): one-time data merge/cleanup for any pre-existing duplicate
  user rows created before normalization (or wipe test users via admin delete).
