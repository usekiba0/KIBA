---
id: 062
title: Un-agreed board tasks — root cause and fix
stage: general
date: 2026-07-29
surface: agent
model: claude-opus-5[1m]
feature: none
branch: fix/board-un-agreed-tasks
user: usekiba0
command: (chat)
labels: ["prod-audit", "task-composition", "board", "pre-launch", "guard"]
links:
  spec: specs/task-composition/plan.md
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/54
files:
 - backend/src/accountability/checkin.processor.ts
 - backend/src/ai/prompts/checkin.prompt.ts
 - backend/src/accountability/todo.service.ts
 - backend/src/ai/board-dump-guard.ts (new)
 - backend/src/ai/coaching.service.ts
 - backend/scripts/sim-name-beat.ts (new)
 - backend/tests/unit/board-dump-guard.spec.ts (new)
 - backend/tests/unit/todo.service.spec.ts
 - backend/tests/unit/checkin.processor.spec.ts
 - backend/tests/unit/checkin.prompt.spec.ts
tests:
 - tests/unit/board-dump-guard.spec.ts — 7 new tests (new suite)
 - tests/unit/todo.service.spec.ts — 2 new multi-goal seeding tests
 - live sim: scripts/sim-name-beat.ts, 3/3 clean on prod model (haiku-4-5)
 - full unit suite: 99 suites / 1364 tests passing; tsc --noEmit clean
---

## Prompt

(screenshot of a user's morning board — 14 items — plus her reply "GM. Not sure where
all these came from cause we never discussed it. So I guess it just made up new tasks
for me. 🤷‍♀️")

Can't rush launch w major bugs like this, small ones yes we move along and fix on way
but how this is something that would just turn users off

now a;lso tell me why theeseissue are coming up

go but fist tell me something to tell to client in simple workrd sfirst while we are fixing

what about karibi msg i sent you in morning "Thing took away the important message where it asks at the start "

so tell me a respoonse for that too

## Response snapshot

### Prod evidence (read-only, external Render host)
Every auto-seeded row on the board, every day, uncommitted:

```
2026-07-29  items: 12  committed: 0      all-time: 405 uncommitted / 9 committed
2026-07-28  items: 10  committed: 0
2026-07-27  items: 14  committed: 0
```

Two goals × a 7-day `action_plan` each; BOTH day-N entries seeded whole, then split per
sentence → 10–14 items a morning, with near-duplicates across the two plans ("Repeat Day
5 routine exactly" beside "Repeat Day 5 structure"). Day-index cycling means she's on
roughly her fifth pass through the same 7 days since 06-25.

An earlier hypothesis — that the board was serving *stale* rows from previous days — was
wrong and was checked before it reached the user: today's rows do exist (12 of them).
The date rendering in the first query was off by one.

### Why the class keeps recurring
1. **The fix existed and was closed.** PR #46 (07-24, "silent-until-agreed mornings")
   predicted this exact message in its own description and was closed unmerged on the
   instruction "keep just phase one". Phase 1 only stopped un-agreed items from
   COUNTING; it deliberately left them VISIBLE. Known accepted symptom, not a regression.
2. **The guard that should have caught it was prompt-only.** "NEVER dump the whole list"
   has been in the coaching prompt since 07-28; the model printed all fourteen anyway.
3. **Multi-goal had no cap and no cross-goal dedup.**

Worth noting for the class: prod runs **haiku-4-5** for conversation, which parrots
prompt examples and ignores soft prohibitions far more readily than a larger model.
Anything that must hold needs to be deterministic.

### Shipped — PR #54
- restored #46 from the closed PR's commit (`e8ebf1f`, cherry-picked clean onto master)
- `todo.service.ts`: round-robin across goals, cross-goal dedup, `MAX_PLAN_ITEMS_PER_DAY`,
  and the drop count logged so a shrinking board is visible
- `board-dump-guard.ts`: deterministic cap on board lines in an outbound message, wired
  into the same guard chain as `correctTimeClaims`. Only lines matching today's board are
  eligible; the remainder is offered, not silently cut

### Also this turn
- PR #53 verified live on Render (`1ea7b18`, health 200) and proven with a 3-run live sim
  on the prod model: goal question back every time, heritage guess gone
- two plain-language client messages drafted (the board issue, and Karibi's signup issue)

### Open
1. PR #54 changes **every user's morning message** — wants an eyeball before deploy.
2. Day-index cycling of the same 7-day plan for 5+ weeks is untouched (was Phase 3).
