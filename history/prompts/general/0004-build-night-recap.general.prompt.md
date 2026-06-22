---
id: 0004
title: Build Night Recap flow
stage: green
date: 2026-06-05
surface: agent
model: claude-opus-4-8[1m]
feature: night-recap
branch: feat/multi-goal-pipeline
user: usekiba0
command: general chat
labels: ["phase1", "accountability", "night-recap", "v1-spec", "bull", "scheduling"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/src/accountability/recap.service.ts (new — schedule/aggregate/send/self-heal)
  - backend/src/ai/prompts/recap.prompt.ts (new — scripted buildNightRecapMessage)
  - backend/src/accountability/schedule-time.util.ts (new — shared computeLocalDelayMs)
  - backend/src/data/migrations/1780500000000-AddLastRecapDate.ts (new)
  - backend/src/data/entities/user.entity.ts (last_recap_date column)
  - backend/src/accountability/checkin.service.ts (delegate computeDelayMs to util)
  - backend/src/accountability/checkin.processor.ts (send-recap handler + recap safety re-arm)
  - backend/src/accountability/accountability.module.ts (register RecapService)
  - backend/tests/unit/recap.prompt.spec.ts, recap.service.spec.ts (new)
  - backend/tests/unit/checkin.processor.spec.ts, checkin-resilience.spec.ts (DI updates)
tests:
  - "jest unit: 50 suites / 440 tests passing; tsc + nest build clean"
commits:
  - "5cdb831 feat(accountability): Night Recap — nightly day-recap flow (V1 spec PART 7)"
---

## Prompt

> compelete whats pending on phase 1 first then will send him a msg

(Then clarified scoring is Phase 1, not Phase 2. The one buildable Phase-1 gap was Night Recap.)

## Response

Built Night Recap — the only Phase-1 V1-spec feature that wasn't implemented. Fires 9pm user-local, aggregates the local day's DailyTodos (done vs still-open) + accepted proofs + execution score, and sends a scripted recap with tomorrow's correction. Architecture mirrors the morning check-in's self-healing design (OnApplicationBootstrap + hourly safety re-arm from CheckinProcessor + self-reschedule) with an atomic per-local-day claim on users.last_recap_date to guarantee once-per-day. Scripted message (returns null on empty board) per Karibi's compact-signals constraint. New send-recap Bull job; computeLocalDelayMs extracted to a shared util. 50/440 tests green, tsc + nest build clean, pushed.

## Follow-ups / risks

- Migration 1780500000000 (last_recap_date) MUST run on deploy or RecapService.fire throws on the claim UPDATE.
- Recap stays silent when the day had no todos (by design) — users who never seed a list won't get one.
- Remaining Phase-1 items are decisions only Karibi can make (score formula, web-vs-SMS onboarding, embarrassment field) + optional deterministic payment-link. Phase 2/3 features deliberately untouched per [[feedback_stay_in_phase1]].
