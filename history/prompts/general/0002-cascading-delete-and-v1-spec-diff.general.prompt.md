---
id: 0002
title: Cascading user-delete and V1 spec diff
stage: green
date: 2026-06-04
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: feat/multi-goal-pipeline
user: usekiba0
command: general chat
labels: ["admin", "data-rights", "gdpr", "testing", "spec-audit"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/src/data/data-rights.service.ts (deleteUserData rewritten: transactional, metadata-driven wipe of all user-scoped tables)
  - backend/src/data/admin.service.ts (deleteUserByPhone now delegates to DataRightsService.deleteUserData)
  - backend/tests/unit/admin.service.spec.ts (added DataRightsService provider + deleteUserByPhone delegation tests)
  - backend/tests/unit/data-rights.service.spec.ts (new — locks in cascading wipe + Stripe cancel)
tests:
  - "jest unit suite: 47 suites / 422 tests passing (was 44/406)"
  - "tsc --noEmit clean"
---

## Prompt

> a and b

(Referring to the prior turn's two offers: (a) make the admin Delete button do a clean cascading wipe; (b) run a spec-vs-implemented diff against the V1 PDF.)

## Response

### (a) Cascading delete — DONE
- `DataRightsService.deleteUserData()` rewritten: best-effort Stripe sub cancel, then a single transaction that DELETEs from every table carrying a `user_id` column (discovered via `dataSource.entityMetadatas`, so future user-scoped tables are covered automatically), then the `users` row. Replaces the old hand-maintained 7-table subset that left goals/proofs/scores/strikes/etc. orphaned.
- `AdminService.deleteUserByPhone()` now delegates to `deleteUserData()` instead of a raw `DELETE FROM users` — so the admin Delete button and the GDPR endpoint share one correct path.
- Tests: added `data-rights.service.spec.ts` (wipes all user-scoped tables, skips global tables, deletes user last, cancels Stripe, survives Stripe failure) + extended `admin.service.spec.ts` (delegation + no-op when user missing). Full unit suite green at 47/422.

### (b) V1 spec diff — DONE (report delivered in chat)
Mapped all 14 V1 features + 19 per-user data fields to the implementation.
- Implemented (7): onboarding intake, daily planning/mission builder, daily missions (DailyTask/DailyTodo), follow-up engine (anti-ghost), proof vault, KIBA score, recurring reminders.
- Partial (2): pattern detection (only day-of-week + recurring-excuse signals), identity mode (referenced in prompts, not persisted as a 90-day statement).
- Missing (5): night recap (the only Phase-1 must-have gap), weekly roast report, challenge system, comeback flow, proactive support offers (faith/money/affirmation/meal) — items 8/10/11 are spec Phase 2, item 13 is spec Phase 3.
- Unstructured/missing per-user fields: bad_habits + avoid-today live in JSONB not columns; wake-up time, proof_requirements, active_challenges, identity_statement not stored; mission deadlines lack specific times.

## Follow-ups / risks

- Night Recap is the one Phase-1 must-have the spec lists that isn't built — candidate next build if Karibi wants V1 spec-complete.
- Metadata-driven delete assumes user-scoped tables use the column name `user_id` (all current entities do).
- No DB FK/ON DELETE CASCADE still — the app-layer wipe is the safeguard; adding FKs later would be an ADR-worthy schema decision.
