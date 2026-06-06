---
id: 0005
title: Fix onboarding question loop (city/wake-time never saved)
stage: green
date: 2026-06-06
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: feat/multi-goal-pipeline
user: usekiba0
command: (chat) "Bro what's wrong w it, keeps asking same questions over and over"
labels: [onboarding, intake, timezone, bugfix, multi-goal]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/messaging/reminder-parser.ts
 - backend/src/messaging/coaching.processor.ts
 - backend/src/ai/coaching.service.ts
 - backend/src/ai/prompts/intake.prompt.ts
 - backend/tests/unit/coaching-reminder-parser.spec.ts
tests:
 - backend/tests/unit/coaching-reminder-parser.spec.ts (34 pass; 12 new parseCityOffset cases)
 - full unit suite: 55 suites / 504 tests pass; tsc + nest build clean
---

## Prompt

Bro what's wrong w it, keeps asking same questions over and over
[3 screenshots of KIBA onboarding re-asking "what city are you in?", "what time do you wake up/start your day?", and "tell me your goal" repeatedly even after the user answered Houston / 9am / Make 100k/month multiple times; even after the close ("ready to start?" → "Yes") it replied "lol my bad. what city are you in?"]

## Response snapshot

Diagnosed: the intake prompt's "STILL MISSING" gate (intake.prompt.ts:82-89) reads PERSISTED state, rebuilt from the DB each message (coaching.processor.ts:196). The conversation history held "Houston"/"9am" but they were never saved, so the gate kept listing utc_offset_minutes as missing and the model re-asked forever. Root cause: the only path writing the timezone from a city name was the Haiku model computing the offset + remembering to call save_intake_field — which it skipped. parseTimezoneOffset (the deterministic auto-capture) only understood abbreviations (PST/UTC+5), not city names, so "Houston" → null. Also found a latent bug on this branch: dispatchIntakeTool rejected array values, so save_intake_field("goals", [...]) always failed (multi-goal save broken at the tool layer).

Fix (make the failing steps deterministic instead of trusting Haiku):
1. Added parseCityOffset() in reminder-parser.ts — ~100 major US/Canada/intl cities → UTC offset, reusing existing DST promotion logic; Arizona/Hawaii/intl as fixed offsets.
2. In handleIntakeMessage, before building ctx: resolve city → utc_offset_minutes and "9am"/"at 8" → checkin_time when those slots are empty, persist + update the in-memory user. Model tool calls still work as fallback.
3. Fixed dispatchIntakeTool to allow string[] (goals); widened IntakeToolHandlers + saveIntakeField types.
4. Corrected the prompt's wrong example (Houston DST is -300, not -360).

## Outcome

- ✅ Impact: an answered onboarding question (city, wake-time, goal-list) can no longer be re-asked; the "STILL MISSING" gate now clears deterministically. Multi-goal `goals` array save unblocked.
- 🧪 Tests: 12 new parseCityOffset cases; full unit suite 504/504 green; tsc + nest build clean.
- 📁 Files: reminder-parser.ts, coaching.processor.ts, coaching.service.ts, intake.prompt.ts, coaching-reminder-parser.spec.ts.
- 🔁 Next prompts: monitor onboarding logs for tz_captured_from_city / checkin_captured_from_text; expand city map if real leads hit unknown cities.
- 🧠 Reflection: gates that read persisted state must have a deterministic writer for that state — never rely on a small model to both reason (city→offset) and remember to call a tool.

## Evaluation notes (flywheel)

- Failure modes observed: Haiku reacts in text and skips the tool call; gate keyed on persisted (not conversational) state → infinite re-ask.
- Graders run and results (PASS/FAIL): unit suite PASS (504/504), build PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): add a no-DST flag per intl city if summer offsets drift; consider deterministic name capture too.
