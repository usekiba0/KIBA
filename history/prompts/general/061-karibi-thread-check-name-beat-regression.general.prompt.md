---
id: 061
title: Karibi thread check — name-beat regression
stage: general
date: 2026-07-29
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (chat)
labels: ["prod-audit", "intake", "prompt", "conversion", "pre-launch"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/ai/prompts/intake.prompt.ts
 - backend/src/messaging/name-capture.ts (new)
 - backend/src/messaging/coaching.processor.ts
 - backend/tests/unit/intake-prompt.spec.ts
 - backend/tests/unit/name-capture.spec.ts (new)
tests:
 - tests/unit/intake-prompt.spec.ts — 2 new regression tests
 - tests/unit/name-capture.spec.ts — 10 new tests (new suite)
 - full unit suite: 98 suites / 1352 tests passing; tsc --noEmit clean
---

## Prompt

please check karibi chat

(follow-up, with screenshot of the live iMessage thread)

Thing took away the important message where it asks at the start

And the name reference makes no sense

## Response snapshot

Pulled the live thread from prod (`GET /v1/admin/users/:id/messages`, kiba-1.onrender.com).
Karibi's old account is gone — he re-signed up 2026-07-29 00:15 UTC on +18325604035
(id `3e41d515…`). Whole thread is 8 messages over 16 minutes, then silence.

**Root cause of both complaints is one line.** `intake.prompt.ts:336`, the TRANSITION
MOMENTS "NAME BEAT" rule, illustrated the uncommon-name case with the literal example
`"karibi - i know that name, kalabari right? what's going on bro?"`. The real Karibi
texted in, and the model emitted the example verbatim:

- the heritage guess ("kalabari right?") was copied straight out of the prompt, not
  invented — which is why it reads as nonsense to him;
- the example's generic tail replaced **step 2's goal ask** ("what are you actually
  trying to lock in right now? gym, money, business, discipline, school"). That is the
  missing "important message at the start". Ray (+18327607529, same EXPLAINER variant,
  common name) got the correct step-2 question three days earlier — clean A/B evidence.
- with nothing concrete to answer, Karibi said "Chilling bro" → "Nothing" and KIBA
  released him ("you know where i'm at"). `intake_data` is `{}`.

**Second-order damage:** `save_intake_field("name", …)` was never called, so `users.name`
is NULL. `shouldNudgeIntake` gates on NAME (the wrong-number guard,
`intake-nudge.ts:78`), so his recovery nudge returns `never_engaged` — he will never be
chased. The nudge system itself is healthy: Ray's fired correctly at 15:00:35 UTC on
07-26, exactly at the window open.

### Fixed
- name-beat example no longer uses a real user's name and no longer models a heritage
  guess; both example tails now carry the goal ask.
- new rule: THE BEAT IS A HINGE, NOT A DETOUR — the name turn must call
  `save_intake_field("name", …)` AND end with step 2's goal question, same turn.
- new rule: NEVER GUESS WHERE A NAME IS FROM (no ethnicity/heritage/language).
- 2 regression tests: no real user name or "kalabari" in the prompt; the hinge rule and
  the vague-opener failure mode are both asserted.

### Then, on "do both"
- **Deterministic name backstop** — new `src/messaging/name-capture.ts`, wired into
  `handleIntakeMessage` next to `parseCityOffset` / `parseReminderTime`. Fires only when
  KIBA's previous message actually asked for the name and the reply parses as one:
  lead-ins stripped ("my name is X", "call me X"), ≤3 alphabetic tokens, no digits /
  handles / links, and a refusal+filler blacklist that explicitly includes the carrier
  keywords — a STOP landing on the naming turn must never be written as a name.
  The model's tool call stays as the path for phrasings we don't recognise.
- **Karibi's row repaired in prod** — `name` was NULL, now `Karibi`. Guarded UPDATE
  (`WHERE id = … AND name IS NULL`), external Render host, dry-run first, 1 row.
  Consequence: he is eligible for the intake nudge again from 15:00 UTC today.

### Open
1. Prompt examples generally: any example built off a live user's name can be parroted
   back at that user. The new test blocks this one; a sweep of the other prompts for
   real names would close the class.
2. `backend/.env` carries Render's INTERNAL `DATABASE_URL`; external access needs the
   `<host>.oregon-postgres.render.com` form (the one-off script rewrites it).
3. Not committed — waiting on the go-ahead.
