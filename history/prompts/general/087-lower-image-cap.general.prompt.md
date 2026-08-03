---
id: 087
title: Drop per-turn image cap to cut vision latency
stage: general
date: 2026-08-03
surface: agent
model: claude-opus-5[1m]
feature: none
branch: perf/lower-image-cap
user: usekiba0
command: follow-up to a 19-photo prod test ("ok")
labels: ["latency", "vision", "media", "prod-measurement"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/76
files:
 - backend/src/messaging/inbound-media.ts
 - backend/tests/unit/message-debouncer.service.spec.ts
 - backend/tests/unit/coaching.service.spec.ts
tests:
 - message-debouncer.service.spec.ts (cap assertions now derived from MAX_TURN_IMAGES)
 - full unit + contract: 1634 passing, 1 suite / 4 tests skipped (needs live Postgres)
---

## Prompt

ok

(Agreeing to the recommendation: drop the image cap first, then look at reply
length, after a 19-photo prod send showed 60–90s perceived latency per reply.)

## Response snapshot

**The 19-photo send proved the spam fix and exposed the cost.** 19 photos → 5
turns (`6, 2, 6, 2, 3`), **zero singletons**, nothing truncated, every photo
reaching the model. But the `perceivedMs` field shipped hours earlier showed what
it cost:

| turn | photos | debounce | gen | send | providerLag | perceived |
|---|---|---|---|---|---|---|
| 1 | 6 | 19275 | **35895** | 8123 | 4492 | **81222** |
| 2 | 2 | 12172 | 13301 | 849 | 6680 | 58202 |
| 3 | 6 | 30255 | **31703** | 8229 | 7985 | **90517** |
| 4 | 2 | 8708 | 20672 | 9006 | 7969 | 68647 |
| 5 | 3 | 22102 | 17650 | 920 | 8098 | 64689 |

**60–90 seconds per reply.** `genMs` scales hard with image count — 32–36s for
six images vs 13–21s for two or three — so the cap is the dominant term.

**Dropped 6 → 3.** The trade is explicit: turn count barely improves (a 12-photo
dump goes 6 → 5 turns, since turns are now bounded by the cap rather than by
arrival gaps), but each turn is far cheaper. What actually killed the spam was the
recency escalation in PR #75, which is independent of this number — only ONE turn
per dump is a singleton now.

Also corrected a claim I made when proposing this: reading the env var lazily
would NOT avoid a restart, since `process.env` is fixed at process start.

Tests that hard-coded 6 now derive from `MAX_TURN_IMAGES`, so the next move of
this number can't silently invalidate them.

## Outcome

- ✅ Impact: six-image turns eliminated; worst-case generation roughly halved.
- 🧪 Tests: cap assertions derived from the constant; 1634 passing; `tsc` clean.
- 📁 Files: 1 source, 2 specs.
- 🔁 Next prompts: re-send ~19 photos and compare `perceivedMs`; then attack vision reply LENGTH, which is the remaining large term.
- 🧠 Reflection: two fixes in a row each solved the stated problem and created the next one — per-photo spam → slow batched replies → this. Worth noticing that `perceivedMs` is what made the second one visible at all; without it this would have shipped looking like a clean win.

## Evaluation notes (flywheel)

- Failure modes observed: a correctness fix (batching) whose cost was invisible until a new metric existed; and tests that hard-coded a tuning constant, which turned a one-line change into a two-test failure.
- Graders run and results (PASS/FAIL): unit + contract PASS (1634); typecheck PASS.
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): shorten the vision reply spec and re-measure `genMs` per image — the per-image slope matters more than the cap once turns are small.
