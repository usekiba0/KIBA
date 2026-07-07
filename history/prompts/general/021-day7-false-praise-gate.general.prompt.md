---
id: 021
title: Day-7 reveal false praise gate
stage: green
date: 2026-07-07
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: fix/postpay-fomo-and-gif-handling
user: usekiba0
command: fix day-7 price reveal congratulating a ghosted user
labels: ["accountability", "retention", "day7-reveal", "sales-copy", "bugfix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/accountability/score.service.ts
 - backend/src/accountability/checkin.processor.ts
 - backend/tests/unit/checkin.processor.spec.ts
 - backend/tests/unit/checkin-resilience.spec.ts
 - docs/REGRESSION_CHECKLIST.md
tests:
 - backend/tests/unit/checkin.processor.spec.ts (buildTrialPriceReveal tiers + handler ghost case)
 - backend/tests/unit/score.service.spec.ts
 - backend/tests/unit/checkin-resilience.spec.ts
 - full unit suite: 859 passed, 4 skipped
---

## Prompt

[Screenshot] Look at this bro I actually didn't do anything. I actually ignored it a lot, but it still got this wrong and said that I did good and passed day three. (KIBA texted: "yo Karibi. 7 days straight. you actually did it, most people fall off by day 3 and you didn't. keeping me on you every morning for scale my business is $20/month…")

## Response snapshot

Root-caused to `buildTrialPriceReveal` being a single hardcoded celebration string, sent by `handleTrialPriceReveal` with no engagement check (only guarded on cancelled/activated/crisis/idempotent). Added `ScoreService.countExecutionDays(userId, sinceDays)` = distinct local days with a COMPLETED DailyTask OR an ACCEPTED Proof (day-key Set collapses a task + its own proof). Injected ScoreService into CheckinProcessor (same accountability module — no wiring change) and gated the reveal on execution days over the trial window (failure → 0 → honest copy). Rewrote `buildTrialPriceReveal` into 3 honest tiers with an identical price+doordash close: ≥4 days celebrates + keeps the "fall off by day 3" boast; 1-3 days = honest partial-week frame; 0 days = honest "you barely let me in this week" ghost copy with NO praise. Updated both processor specs (ScoreService provider + tier/ghost tests) and REGRESSION_CHECKLIST B10.

## Outcome

- ✅ Impact: KIBA can no longer fabricate a "7 days straight / you actually did it" streak for a user who ghosted the trial; the day-7 conversion message now maps to real follow-through.
- 🧪 Tests: 859 unit pass, tsc clean; new tiered + ghost-case assertions; rendered all 3 tiers to eyeball voice.
- 📁 Files: score.service.ts, checkin.processor.ts, 2 specs, REGRESSION_CHECKLIST.md.
- 🔁 Next prompts: consider similar reality-gating on any other milestone/social-proof copy; ship + verify in prod.
- 🧠 Reflection: hardcoded praise copy is a latent liability whenever it asserts a behavioral fact — gate on a signal, default to honest.

## Evaluation notes (flywheel)

- Failure modes observed: congratulatory copy asserting an achievement (streak) with no backing signal.
- Graders run and results (PASS/FAIL): unit suite PASS (859).
- Prompt variant (if applicable): n/a (deterministic copy).
- Next experiment (smallest change to try): audit remaining hardcoded "you did X" lines (milestone.prompt, recap) for the same reality-gap.
