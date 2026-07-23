---
id: 041
title: Night recap silent diagnosis
stage: green
date: 2026-07-23
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: master
user: usekiba0
command: none
labels: ["recap", "prod-forensics", "tdd", "dead-zone", "audit-followup"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/43
files:
  - backend/src/ai/prompts/recap.prompt.ts
  - backend/tests/unit/recap.prompt.spec.ts
  - backend/tests/unit/recap.service.spec.ts
tests:
  - 5 new tests (TDD red-first) for the proof-only day + still-silent-on-empty-day
  - Two existing service tests corrected: they asserted silence with a 2-proof fixture; intent was "nothing happened" so they now pin proofCount 0
  - Full unit suite 1229 passed / 89 suites; tsc clean; lint clean
---

## Prompt

do it

(Context: user authorized digging into the recap engine — flagged in the evening re-check as not firing — then authorized the merge.)

## Response

**Diagnosis overturned the assumption.** The recap scheduler was never broken. Render logs 2026-07-21..23:
- recaps_scheduled: 96
- recap_skipped_no_activity: 8 (every fire, all 3 active users)
- recap_send_failed / duplicate_suppressed / deferred: 0

So bootstrap + hourly re-arm + self-reschedule all worked; the job woke up nightly and chose to send nothing.

**Root cause: dead zone from an earlier correct fix.** `buildNightRecapMessage` returned null on `done===0 && missed===0`. The 2026-06-29 fix excluding never-agreed PLAN todos from `missed` (which correctly killed the "❌ 33 missed / you folded" shaming recaps) means any user whose board is entirely auto-seeded arrives with both lists empty → null → silence, every night, including nights they sent proof. The weekly-review twin already counted proofCount in its own null gate; the night recap did not — they had silently diverged.

Connects both halves of the same disease: pre-fix the recap shamed users for un-agreed tasks; post-fix it had nothing it was allowed to discuss and went mute. Root cause for both = un-agreed task composition.

**Fix (PR #43, merged ada1ffc):** gate now `done===0 && missed===0 && proofCount===0` (aligned with twin) + new proof-only closing branch that acknowledges the proof, states it's only what KIBA can see, asks what the board missed, and asserts nothing about the empty board (Retraining B4 compliance so it can't become a new "you folded"). Genuinely empty day still silent, test-pinned.

**Stated scope limit:** restores recaps for days with a recorded Proof row. A user working purely conversationally (Bianca logs meals as text) may still get silence — that's task composition, still open, and the actual root cause.
