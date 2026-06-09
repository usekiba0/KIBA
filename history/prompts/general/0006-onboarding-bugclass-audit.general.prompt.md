---
id: 0006
title: Audit + fix for the onboarding-loop bug class
stage: refactor
date: 2026-06-06
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: feat/multi-goal-pipeline
user: usekiba0
command: (chat) "chck for all similar issues the code might have"
labels: [onboarding, audit, crisis-safety, intent-detection, timezone, bugfix]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/messaging/reminder-parser.ts
 - backend/src/messaging/coaching.processor.ts
 - backend/src/ai/crisis.service.ts
 - backend/tests/unit/coaching-reminder-parser.spec.ts
tests:
 - backend/tests/unit/coaching-reminder-parser.spec.ts (52 pass)
 - full unit suite: 55 suites / 522 tests pass; tsc + nest build clean
---

## Prompt

chck for all similar issues the code might have

## Response snapshot

Audited the codebase (3 parallel Explore agents, then verified each candidate by reading actual code) for the two faces of the bug class fixed in PHR 0005: (1) a gate reads PERSISTED state whose only writer is an unreliable LLM tool call; (2) tool-dispatch guards that silently drop schema-valid inputs.

CONFIRMED + FIXED:
1. parseCityOffset coverage gap (HIGH) — the city→offset map missed most US metros, so any unmapped city re-looped exactly like Houston. Added ~70 curated unambiguous cities (TX/CA/Eastern/Mountain metros, Arizona fixed-no-DST, + intl). Ambiguous cross-zone names (Springfield/Aurora/Glendale/Salem/Arlington) intentionally omitted to avoid guessing the wrong offset.
2. RESET_INTENTS false-positive (MEDIUM) — `['start fresh', 'clear my history', ...]` matched via `.includes()`, so "start fresh on monday with a new workout plan" silently wiped the session cache. Replaced with anchored whole-message regex RESET_INTENT_RE (optional filler + reset phrase + optional politeness, ^...$).
3. Crisis benign-gate too narrow (MEDIUM, safety) — crisis.service Fast-path 2 auto-marks any <120-char message benign WITHOUT an ML call unless it matches a soft-indicator regex. Short crisis phrasings missing from both the keyword list and that regex (e.g. "i'm done, i can't do this") skipped ML entirely. Widened the regex additively (more terms → more ML routing, never less) — added can't do this / can't go on / no point / end it / want out / tired of living / better off without / don't want to be here / i'm done, etc.

DISMISSED (verified non-issues):
- react_to_message: messaging.service validates against VALID_REACTIONS and returns a clean error, never throws.
- save_profile_field: handler validates its own enum; runChat marks ok:false as is_error so the model sees the rejection.
- BILLING_INTENT_RE breadth: intentional per code comment (false negatives burned prod).
- embarrassment field: soft, optional elicitation (not a hard gate) and no deterministic source — by design.
- checkin_time: has a 09:00 default + deterministic parser, so no loop.

NOTED (not fixed): ScoreIntentService phrase list is narrow (LLM fallback, low impact); REMINDER_REGEX + parseRelativeDelayMs are dead code (reminder scheduling never wired).

## Outcome

- ✅ Impact: closed the remaining instances of the loop class (unmapped cities), stopped an accidental session-wipe, and tightened a safety-critical crisis fast-path.
- 🧪 Tests: +18 (city expansion + RESET_INTENT_RE); full unit suite 522/522 green; tsc + nest build clean.
- 📁 Files: reminder-parser.ts, coaching.processor.ts, crisis.service.ts, coaching-reminder-parser.spec.ts.
- 🔁 Next prompts: surface Karibi the crisis benign-gate change for sign-off; consider a hard loop-breaker if an offset still can't resolve after N intake turns.
- 🧠 Reflection: subagents over-report — every flagged finding needed a direct code read; 5 of 8 candidates were non-issues.

## Evaluation notes (flywheel)

- Failure modes observed: static maps/keyword lists with coverage gaps; substring intent matching causing false positives.
- Graders run and results (PASS/FAIL): unit suite PASS (522/522), build PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): deterministic fallback when city stays unresolved (ask "what time is it for you right now?" and compute from clock).
