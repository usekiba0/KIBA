---
id: 0009
title: Deterministic time-query fix (wrong time)
stage: green
date: 2026-06-21
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: master
user: usekiba0
command: general
labels: ["time", "intake", "coaching", "bugfix", "deterministic-short-circuit"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/messaging/local-time.ts (new)
 - backend/src/messaging/coaching.processor.ts
 - backend/src/ai/prompts/coaching.prompt.ts
 - backend/src/ai/prompts/intake.prompt.ts
 - backend/tests/unit/local-time.spec.ts (new)
tests:
 - backend/tests/unit/local-time.spec.ts (new, 30+ cases)
 - backend/tests/unit/coaching.prompt.spec.ts (unchanged, still green)
 - backend/tests/unit/intake-prompt.spec.ts (unchanged, still green)
 - full unit run: 659/659 pass; tsc clean
---

## Prompt

lets discuss it once we resolve the issue reported by client [Image #2] wrong time again

(Screenshot: intake-stage Houston user. KIBA replied "it's currently around 4:51pm your time" while the conversation's own "Read 5:04 PM" receipt showed actual time ~5:04 PM — ~13 min behind.)

## Response snapshot

Diagnosed: NOT a timezone-math bug. `nowUtc` is captured fresh via `new Date()` at
prompt-build time and `process()` runs synchronously off the 1.5s debouncer (no
background queue), so the snapshot can't be stale by 13 min. The reported 4:51 is
13 min BEFORE the message was even received — impossible from the fresh clock line.
Root cause: the model ignores the "read the clock line verbatim" instruction and
ESTIMATES the time ("around" is the tell). Compounding factor for intake: the
intake prompt referenced "the CURRENT TIME context" that was never actually injected.

Fix (user chose "Both" = deterministic short-circuit + prompt hardening):
1. New `messaging/local-time.ts`: `isTimeQuery()` (whole-message regex), plus
   `formatLocalClock12h()` ("5:04pm") and `formatLocalClockPretty()` shared formatters.
2. `coaching.processor.ts`: deterministic short-circuit BEFORE stage routing (runs
   for intake AND coaching) — when message is a pure time query, no media, and offset
   known, answer `it's <clock> your time.` computed at send time. Offset unknown →
   fall through so the AI asks for city.
3. `coaching.prompt.ts`: reuse shared formatter; harden wording ("COPY digit for
   digit, no 'around', no rounding, no math").
4. `intake.prompt.ts`: inject the previously-missing CURRENT TIME block (only when
   nowUtc + offset present); thread `nowUtc` through the intake ctx.

## Outcome

- ✅ Impact: "what time is it" now answered deterministically (always correct) for both intake and coaching users; prompt references to local time use the same formatter so any model-echoed time matches.
- 🧪 Tests: 659/659 unit pass, tsc clean. Only failures are the live-Postgres integration suite (environmental, non-blocking).
- 📁 Files: 2 new (helper + spec), 3 edited (processor + 2 prompts).
- 🔁 Next prompts: verify the client's stored utc_offset_minutes in /admin (should be -300 for Houston CDT); then resume the deferred discussion on fetching inbound iMessage reactions.
- 🧠 Reflection: prompt-only "read it verbatim" guardrails had already failed repeatedly for time; moving the wall-clock answer out of the LLM entirely is the durable fix. Same pattern as parseCityOffset / reminder parsing.

## Evaluation notes (flywheel)

- Failure modes observed: LLM estimates wall-clock time despite explicit verbatim instruction; intake prompt referenced a CURRENT TIME context that didn't exist.
- Graders run and results (PASS/FAIL): unit suite PASS (659/659); tsc PASS.
- Prompt variant (if applicable): hardened time directive in coaching + new intake CURRENT TIME block.
- Next experiment (smallest change to try): if mid-conversation (non-explicit) time drift still reported, consider also short-circuiting relative scheduling confirmations.
