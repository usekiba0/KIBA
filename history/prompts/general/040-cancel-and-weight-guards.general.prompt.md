---
id: 040
title: Cancel and weight guards
stage: green
date: 2026-07-23
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: master
user: usekiba0
command: none
labels: ["compliance", "fabrication-guard", "tdd", "audit-followup", "cancellation"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/42
files:
  - backend/src/ai/cancellation-guard.ts (new)
  - backend/src/ai/weight-claim-guard.ts (new)
  - backend/src/ai/coaching.service.ts
  - backend/src/ai/prompts/coaching.prompt.ts
  - backend/tests/unit/cancellation-guard.spec.ts (new)
  - backend/tests/unit/weight-claim-guard.spec.ts (new)
  - backend/tests/unit/coaching.prompt.spec.ts
tests:
  - 25 new tests (TDD red-first) using literal prod strings; full negative set for the reminder carve-out
  - Full unit suite 1224 passed / 89 suites; tsc --noEmit clean; eslint clean
---

## Prompt

do it  →  merge

(Context: user reviewed the 2026-07-23 evening thread re-check findings and authorized building the cancellation-intent guard and weight-anchor guard, then authorized the merge.)

## Response

Shipped PR #42, squash-merged as b611eae.

**1. Cancellation obstruction (compliance).** Root cause was coaching.prompt.ts:651 which instructed "never accept 'i quit' ... frame leaving as LOSING that ('you're at [score], dropping it is the real cost')". Karibi asked to cancel on a paid sub and got three retention pushes with the exit never named.
- Prompt rule rewritten: one honest reply, pause/scale-down offer allowed, real path in the SAME message; bans stalling/arguing/asking-twice/score-as-leverage/"you're running". Banned phrasing is described, not quoted — a test caught that quoting it verbatim risks priming the behavior.
- New cancellation-guard.ts: detects cancel intent as a SENTENCE (gap opt-out.ts deliberately leaves — bare "cancel" already unsubscribes, substring matching would wrongly unsubscribe "cancel my 8pm reminder"), then enforces the path on the finished reply. Additive, save attempt survives.
- Documented inverted error asymmetry: false positive = one honest line; false negative = trapped paying customer. Detection leans inclusive.
- Only names real paths (STOP / support@usekiba.ai) — no billing portal exists; test asserts no URL.

**2. Fabricated weight progress.** "you started at 205.2 lbs last friday. that's 5.6 lbs down in one week" — 205.2 was 07-03 (3 weeks back); last Friday was 202.4; true delta 2.8 lbs (exactly half what was reported). Anchor frozen, error compounding weekly (also wrong 07-14, 07-17).
- New weight-claim-guard.ts, same family as time/math guards: weigh-ins extracted from USER messages only (AI echo must never become its own evidence), week-ago anchor chosen by date (5-10 day window), delta by subtraction, 0.25 lb tolerance. Narrow: only "N lbs down in one week"; total-progress claims and gains untouched; silent when no week-ago weigh-in exists.

Prompt-size budget raised 31.6k→31.9k with recorded rationale.

Deferred (flagged, not fixed): recap engine not firing, weigh-in cadence cron-vs-conversation contradiction, duplicate morning-board items, un-agreed task composition, fabricated "you're 20 years old".
