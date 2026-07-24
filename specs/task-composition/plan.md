# Task Composition — Approach C: agreement-gated board

**Status:** DRAFT for review (no code written yet)
**Date:** 2026-07-24
**Decision owner:** Karibi (behavioral change to live product)

## Problem (one sentence)
The daily board is seeded from a plan the LLM wrote once at onboarding and cycled by day-index forever, never reconciled with the actual conversation — so it shames users for tasks they never agreed to, loops stale plans for weeks, contradicts agreed cadences, and leaves the recap with nothing honest to say.

## The two seed paths (both must change)
| System | Entity | Seeder | Consumes | Drives |
|---|---|---|---|---|
| Headline task | `DailyTask` | `taskService.ensureTodayTask` | `action_plan.daily_tasks[dayIdx]` | morning check-in, strikes |
| Item list | `DailyTodo` (source=`PLAN`) | `todoService.ensureSeededForToday` | same `daily_tasks[dayIdx]` | recap, weekly review, AI board |

Existing partial mitigations already in place (do NOT undo): recap excludes OPEN `PLAN` items from `missed` (06-29); check-in suppresses stale scheduling tasks when `weekly_schedule` is set (07-21); near-dup collapse (PR #44).

## Approach C, precisely stated
The plan becomes a **suggestion source, not a commitment source.** A plan item is only a "commitment" (countable, recappable, strike-eligible) once the user has actually **agreed to it** in conversation. Un-agreed plan items are still visible to the AI as *proposals* it can offer — they just never appear as the user's committed board, never count as missed, and never drive a strike.

This kills the whole class: nothing the user didn't agree to can shame them, contradict them, or loop at them.

## Data model change
Add one nullable column to `daily_todos`:
- `committed_at timestamptz null` — set when the user agrees to the item.

Semantics:
- `PLAN` item, `committed_at IS NULL` → **proposal.** AI may surface it as a suggestion; excluded from recap/weekly counts and from the headline task.
- `committed_at IS NOT NULL` (any source) → **commitment.** Counts everywhere. `USER`/`AI` items are committed on creation (the user/coach put them there in conversation).
- Agreement is set by a new AI tool `commit_todo(todo_id)` the model calls when the user says yes to a proposed item ("yeah let's do the reddit thing", "ok I'll weigh in friday").

## Phasing (each phase independently shippable + reversible)

### Phase 1 — make the distinction real, change nothing visible yet
- Migration: add `committed_at`.
- Backfill: `USER`/`AI` rows → `committed_at = created_at`; `PLAN` rows → null.
- Recap/weekly-review already ignore OPEN PLAN in `missed`; extend so `done`/counts also only include committed items (a completed proposal still counts — completion IS agreement, so mark `committed_at` on `markDone`).
- **No user-visible behavior change.** Pure plumbing + tests. Safe to ship.

### Phase 2 — the AI proposes instead of asserts
- Prompt: the board block distinguishes "committed today" from "suggestions from your plan". AI presents suggestions as offers, never as things the user already owes.
- Add `commit_todo` tool; prompt tells the model to call it the moment the user agrees to a suggestion.
- Morning check-in: headline task comes from a **committed** item if one exists; otherwise the check-in offers the top plan suggestion rather than asserting it.
- This is the real behavioral shift — review a live sim before prod.

### Phase 3 — stop the stale loop
- Replace day-index cycling: when the plan has been fully cycled or is contradicted by conversation, the AI regenerates the next block of plan suggestions from recent context (not a fresh onboarding plan). Bounded, guardrailed, opt-in per user first.

## What each phase fixes
- **P1:** recap stops being able to shame/silence on un-agreed items; weekly counts become honest. (Also finally fixes the recap-silence proof-path limit — a committed-but-text-logged task counts without needing a photo.)
- **P2:** morning board stops asserting un-agreed tasks; weigh-in contradiction dies (a weigh task is only a commitment if the user agreed to the cadence).
- **P3:** Sam's 4-week identical loop dies.

## Risks / guardrails
- **Emptier boards** for passive users → P2 keeps suggestions visible so the AI still has material; it just offers instead of demands.
- **Model over-eager to commit** → `commit_todo` requires explicit user assent in the same turn (same pattern as the cussing-consent tool); a false commit is recoverable (user can decline, uncommit).
- **Don't regress** the 06-29 / 07-21 / PR#44 mitigations — Phase 1 tests must pin them.
- **Scope/billing:** P1 is Phase-1 maintenance (fixes live bugs). P2/P3 are behavioral product changes — confirm they're in scope before building.

## Open questions for Karibi
1. OK to ship **Phase 1** now as maintenance (invisible plumbing, makes counts honest)?
2. For **Phase 2**, do you want the check-in to still *offer* a plan task when nothing's committed, or go fully silent-until-agreed?
3. Is P2/P3 Phase-1 maintenance or does it wait for the Phase-2 contract?
