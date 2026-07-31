---
id: 042
title: Board dedup age scheduled-kind
stage: green
date: 2026-07-24
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: master
user: usekiba0
command: none
labels: ["coaching", "task-composition", "fabrication-guard", "admin-api", "tdd"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/44
files:
  - backend/src/accountability/todo.service.ts
  - backend/src/data/admin.service.ts
  - backend/src/ai/prompts/coaching.prompt.ts
  - backend/tests/unit/todo-plan-split.spec.ts
  - backend/tests/unit/coaching.prompt.spec.ts
tests:
  - 8 new/changed assertions (TDD red-first) — near-dup collapse + non-collapse guardrails; age HARD FACT
  - Full unit suite 1235 passed / 89 suites; tsc clean; lint clean
---

## Prompt

keep moving  →  merge now

(Context: user cleared me to work the four small open items from the 2026-07-23 evening re-check. I took three; pulled the fourth.)

## Response

Shipped PR #44, squash-merged 9bb87f4.

1. Duplicate morning-board items: splitPlanDayIntoItems now collapses near-duplicates within a day — identical content words (articles/possessives/order ignored) OR shared first-3 content words in order. Keeps first/fuller phrasing. Strict on purpose (dropping a real task is worse): "call 5 leads"/"email 5 leads" and "review your week"/"review your macros" kept.
2. Fabricated age: always-on HARD FACT that age is unknown (never collected), never state/guess a number. Kills "you're 20 years old" (Karibi 07-23).
3. scheduled_kind added to admin getUserMessages select — PR #33/#41 discriminator was invisible to admin thread + audits.

PULLED (honest scope call): the weigh-in cron-vs-conversation contradiction. Conversation layer already respects cadence; the morning BOARD still seeds weigh/photo tasks from the plan regardless. Same task-composition seed subsystem = design work, not a small fix.

After this, the remaining open board is essentially ONE thing: the task-composition design pass, which now owns the weigh-in contradiction AND the recap-silence proof-path limit observed in the 07-24 morning watch.
