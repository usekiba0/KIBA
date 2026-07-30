---
id: 074
title: Bubble split regressed send time — capped at 2
stage: general
date: 2026-07-30
surface: agent
model: claude-opus-5[1m]
feature: none
branch: fix/cap-auto-bubbles
user: usekiba0
command: (freeform)
labels: ["regression", "latency", "bubbles", "measurement"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/src/messaging/bubbles.ts
  - backend/tests/unit/bubbles.spec.ts
  - history/prompts/general/074-bubble-send-regression-cap.general.prompt.md
tests:
  - "npx jest tests/unit/ — 104 suites / 1407 tests passing"
  - "npx tsc --noEmit — clean"
---

## Prompt

tthe msg time is still long

## Response snapshot

### I caused this one

PR #61 shipped at 17:30. Karibi tested at 17:32 and said it still felt long. Pulled
his actual turns:

| | 7-day baseline | his 6 turns at 17:32-17:37 |
|---|---|---|
| `genMs` | 2,508 ms | 1,634-2,531 ms (fine) |
| **`sendMs`** | **399 ms** | **1,238-3,095 ms** |
| bubbles | 1 | **2, 3, 4, 3, 4, 4** |

`genMs` was healthy. **`sendMs` quadrupled.** Every bubble is its own provider
round-trip (~400 ms) plus `MESSAGE_BUBBLE_DELAY_MS` (350 ms) between them, so a
4-bubble reply spends ~2,650 ms sending where a 1-bubble reply spent 400 ms.

**The defect is mine and it is precisely a broken promise:** I described the split as
"capped at 2 bubbles", and capped the *sentence* path at 2 — but the blank-line path
returned every paragraph and fell through to `MAX_BUBBLES = 4`. haiku writes 3-4
paragraphs, so it produced 3-4 bubbles. The PR description and the code disagreed and
I did not check which one prod would follow.

### Fix

`AUTO_SPLIT_MAX = 2` with `capAuto()` folding the tail into bubble 2. A split **we**
decide on stops at 2; `MAX_BUBBLES = 4` still applies to an explicit `[pause]`, where
the model actually asked for the break.

Projected: `sendMs` ~2,650 → ~1,150 ms (2 sends + one gap), putting e2e back at the
~3.4 s baseline while keeping the two-bubble rhythm.

### Ruled out first, by measurement

Before touching the split I checked the two things I'd have guessed at:

- **Text model.** Benchmarked the real coaching prompt: haiku-4-5 TTFT 910 ms /
  total 1,343 ms vs sonnet-5 TTFT 1,375 ms / total 2,703 ms. **haiku is the right
  model for text** — the vision result did not generalise.
- **History size.** `COACHING_HISTORY_LIMIT = 60`. Measured 0 / 20 / 60 messages:
  TTFT 989 / 1,033 / 942 ms, total 1,236 / 1,129 / 1,296 ms. **No effect.** Trimming
  history would have bought nothing.
- **Typing indicator.** Confirmed firing in prod — `send_typing_indicator` returns
  `status: "SENT"`, and `SENDBLUE_FROM_NUMBER` is set in Render (the early-return
  guard that would have silently disabled it).

A single full model call is ~1.3 s, but prod `genMs` p50 is ~2.5 s — roughly double,
which points at a second model call from the tool loop. Not yet confirmed; that is
the next thing to measure, and it is the largest remaining slice.

## Outcome

- ✅ Impact: removes a self-inflicted ~1.5 s regression on every multi-bubble reply.
- 🧪 Tests: 104 suites / 1407 passing; tsc clean.
- 📁 Files: `bubbles.ts`, `bubbles.spec.ts`.
- 🔁 Next prompts: confirm `sendMs` drops back near 1.1 s on his next test; consider
  `MESSAGE_BUBBLE_DELAY_MS` 350 → 0/150 (another ~200-350 ms, at the cost of the
  bubbles reading as typed rather than arriving together); measure the tool-loop
  second call.
- 🧠 Reflection: I shipped a cap I had described but not implemented on the path that
  mattered, and the person testing found it within two minutes. The prod telemetry
  showed it instantly — `sendMs` was right there in the same log line I had been
  reading all day. Check the metric you already have before asking what went wrong.

## Evaluation notes (flywheel)

- Failure modes observed: stated a constraint ("capped at 2") in the PR description
  that the code only enforced on one of two code paths. The second path was added
  later in the same PR and inherited a different, looser cap.
- Graders run and results (PASS/FAIL): unit suite PASS (1407/1407)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): after this deploys, pull `turn_latency`
  + `reply_sent` for the same tester and confirm bubbles ≤ 2 and `sendMs` ≈ 1.1 s.
