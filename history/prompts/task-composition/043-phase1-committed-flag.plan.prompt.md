---
id: 043
title: Task composition Phase 1 committed flag
stage: plan
date: 2026-07-24
surface: agent
model: claude-opus-4-8[1m]
feature: task-composition
branch: master
user: usekiba0
command: none
labels: ["task-composition", "recap", "migration", "tdd", "approach-c"]
links:
  spec: specs/task-composition/plan.md
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/45
files:
  - specs/task-composition/plan.md (new — design doc, Approach C, 3 phases)
  - backend/src/data/entities/daily-todo.entity.ts (committed_at column)
  - backend/src/data/migrations/1782100000000-AddDailyTodoCommittedAt.ts (new)
  - backend/src/accountability/recap.service.ts (count on committed_at)
  - backend/src/accountability/weekly-review.service.ts (count on committed_at)
  - backend/src/accountability/todo.service.ts (commit on create + on markDone)
  - backend/tests/unit/todo.service.spec.ts (new)
  - backend/tests/unit/recap.service.spec.ts
  - backend/tests/unit/weekly-review.service.spec.ts
tests:
  - New todo.service.spec (commit-on-create USER/AI, commit-on-complete, no-overwrite, PLAN-stays-proposal)
  - Committed-gated count cases added to recap + weekly-review specs; fixtures updated to mirror backfill
  - Full unit suite 1242 passed / 90 suites; tsc clean; lint clean
---

## Prompt

c  →  just phase 1  →  merge and deploy

(Context: user chose Approach C for the task-composition fix, scoped Phase 1 only, then authorized merge+deploy.)

## Response

Wrote the design doc (specs/task-composition/plan.md — Approach C: plan becomes a suggestion source, 3 phases) and shipped Phase 1 as PR #45 (merged ec1671e).

Phase 1 = invisible plumbing. Added daily_todos.committed_at (null=proposal, set=commitment). USER/AI todos commit on creation; markDone commits retroactively (completion=agreement); auto-seeded PLAN rows stay null. Recap + weekly-review done/missed counts now key on committed_at instead of `source !== PLAN`. Migration backfill (COALESCE(completed_at,created_at) WHERE source IN user/ai OR status=done) makes the counted sets identical before/after — behaviour-preserving refactor, safe to ship with no live sim.

DB migration runs on deploy (migrationsRun:true). Deploy watch in progress.

DEFERRED, gated on user review (plan doc open questions):
- Phase 2: AI proposes suggestions + commit_todo tool; check-in stops asserting un-agreed tasks (kills weigh-in contradiction). Needs live sim.
- Phase 3: regenerate stale plans (kills Sam's 4-week loop).
Open Q for Karibi: (2) when nothing committed, check-in offers a plan task or goes silent? (3) is P2/P3 Phase-1 maintenance or wait for Phase-2 contract?
