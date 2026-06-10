---
id: 0008
title: Fix intake anchor/why loops + value-first
stage: green
date: 2026-06-10
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: feat/multi-goal-pipeline
user: usekiba0
command: (chat) Karibi rage-quit intake — admin chat review
labels: ["onboarding","intake","interrogation-loop","value-first","frustration","phase-1"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/ai/prompts/intake.prompt.ts
 - backend/tests/unit/intake-prompt.spec.ts
tests:
 - backend/tests/unit (56 suites / 529 tests) — all green
 - npx tsc --noEmit — clean
 - npx nest build — exit 0
---

## Prompt

Pulled Karibi's live conversation from the prod admin API (he was "hell pissed off"). Transcript
(2026-06-10 19:52-20:04 UTC, on the new build) showed three intake loops: (1) KIBA demanded he pick ONE
"anchor" between gym and business ~8 times, ignoring "Both" (x2), "ngl bro stfu", and "they're two
different things"; (2) after he picked gym, KIBA re-asked "why does it matter" repeatedly, didn't accept
"mindset/feel better/look", he said "I just told you" and "Bro enough questions" and it asked AGAIN;
(3) it refused immediate value — deflected a snack question and flat-refused a workout ("we're not there
yet bro"), violating the Immediate Value framework. Fix the loops, deliver value during intake.

## Response snapshot

Root cause was all in intake.prompt.ts: the anchor step forced a single pick, the why/obstacle steps
were a hard gate ("you do NOT have their why yet — get it before the close"), a rule literally said
"Do NOT coach, give workout/diet plans... You are closing, not coaching", and a tone rule said when they
get annoyed "back off softly but STAY ON THE SAME STEP" (the loop instruction).

Fixes:
- ANCHOR: ask once, max. On "both"/pushback/annoyance, pick one FOR them (first/most-daily), save, move on.
- WHY/OBSTACLE: accept the first real answer, never re-ask; best-effort, not a trap. Close without them
  if the lead resists.
- VALUE-FIRST: replaced the "don't coach" block with "DELIVER VALUE WHEN THEY ASK FOR IT" (give the
  workout/snack/tip, then tie back). Only reminders stay gated (tool not live pre-pay).
- READ THE ROOM block: detect irritation (stfu, enough, "i just told you", repeats) → acknowledge, take
  what's given, move forward. "NEVER ask the exact same question more than once."
- Changed the "stay on the same step" tone rule to "back off AND MOVE ON".
- Removed now-unused haveWhy/haveObstacle; updated intake-prompt.spec to assert the new behavior.

## Outcome

- ✅ Impact: intake no longer interrogates or loops; honors annoyance; delivers real help mid-onboarding.
- 🧪 Tests: 56 suites / 529 unit tests green; tsc clean; nest build exit 0.
- 📁 Files: intake.prompt.ts + its spec.
- 🔁 Next prompts: redeploy; optionally reset Karibi's stuck intake record for a clean re-test.
- 🧠 Reflection: prior fix solved "answer product questions" but the build sequence itself was the trap;
  the killer line was "back off softly but stay on the same step".

## Evaluation notes (flywheel)

- Failure modes observed: forced single-anchor pick; why treated as a depth gate; hard no-coaching rule;
  "stay on the same step" on annoyance.
- Graders run and results (PASS/FAIL): unit suite PASS (529/529).
- Prompt variant (if applicable): intake.prompt.ts anchor/why/value-first/read-the-room edits.
- Next experiment (smallest change to try): live-watch Karibi's next session post-deploy; if the model
  still over-asks, add a turn-count cap per field in code.
