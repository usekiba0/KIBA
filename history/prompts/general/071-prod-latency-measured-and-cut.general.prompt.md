---
id: 071
title: Prod latency measured, then cut
stage: general
date: 2026-07-30
surface: agent
model: claude-opus-5[1m]
feature: none
branch: perf/reply-length-and-latency-cuts
user: usekiba0
command: (freeform)
labels: ["latency", "measurement", "reply-length", "prompt-caching", "render", "vision"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/src/ai/prompts/coaching.prompt.ts
  - backend/src/ai/coaching.service.ts
  - backend/src/messaging/message-debouncer.service.ts
  - backend/src/messaging/coaching.processor.ts
  - backend/tests/unit/coaching.prompt.spec.ts
  - DEPLOYING.md
  - history/prompts/general/071-prod-latency-measured-and-cut.general.prompt.md
tests:
  - "npx tsc --noEmit — clean"
  - "npx jest tests/unit/ — 104 suites / 1391 tests, all passing"
---

## Prompt

read recipet and typing indicatior are active and you do check all the other thing you want to check but we need to expedite

## Response snapshot

### The measurement (first read of prod `turn_latency`, ever)

`RENDER_API_KEY` / `RENDER_SERVICE_ID` / `RENDER_OWNER_ID` are in `backend/.env` —
that unlocked the Render Logs API, which nobody had used. 147 `turn_latency` rows
+ 53 `ai_call` rows over 7 days.

| Path | p50 | p90 | p95 | max |
|---|---|---|---|---|
| Text | 3.39 s | 5.17 s | 6.02 s | 8.6 s |
| Intake | 2.81 s | 5.27 s | 6.18 s | 13.8 s |
| Vision | **14.7 s** | — | — | **19.2 s** |

⚠️ `e2eMs` is **server-side only** — it starts at our webhook and ends when we hand
the reply to SendBlue. On-device is ~1-2s worse. Tomo's 3.8s was on-device.

### Two findings that changed the plan

**1. Prompt caching is a COST lever, not a latency lever.** A/B on the same code path:

| | n | genMs p50 |
|---|---|---|
| Cache hit | 19 | 2,092 ms |
| Cache miss | 14 | 1,945 ms |

Misses were *faster* (they had shorter replies). Re-prefilling the 12k-token cached
prefix costs no measurable wall-clock on Haiku. **This killed the "fix the intake
cache for latency" recommendation** made one turn earlier — it would have been the
wrong fix, confidently delivered.

**2. The real equation.** `genMs ≈ 1,624 ms + 8.0 ms × outputTokens` (n=33, r=0.666).
A 1.6s fixed floor (unreachable without streaming, which the guard chain forbids),
and everything above it is reply length. Tomo's 10-token reply = ~80ms of
generation; our p90 (298 tokens) = ~2,390ms.

### Infrastructure: cleared

Render `starter`, Oregon, 1 instance, no autoscaling. **Starter does not spin down
— cold start is ruled out.** Warm health TTFB ~300ms. A bigger instance buys nothing;
the wait is Anthropic API + SendBlue, not CPU.

### Shipped

1. **Bounded the plan/list carve-out.** `coaching.prompt.ts:477` said "under 60 words
   **unless they asked for a plan or a list**" — an unbounded escape hatch, and prod
   showed the entire p90 tail lives in it. Now `plans/lists: 5 lines max, 10 words each`.
   Same cap added at the CORE RULES plan line (`:752`).
2. **`max_tokens` 512 → 400** as a backstop (observed max output was 424, p95 373 —
   512 never bound anything). Prompt caps are the primary limit; this clips runaways.
3. **`recordMessage` un-awaited** — two DB writes (counter + timestamp) that nothing
   in the same turn reads, sitting in front of the model call. Same treatment as
   `last_active_at` in PR #59; failures now log rather than vanish.
4. **`MESSAGE_IMAGE_DEBOUNCE_MS` env knob**, default unchanged at 3000.

### Deliberately NOT shipped, with reasons

- **Image debounce 3000 → 1200 (the requested change).** The code comment records
  that **1.5s was already tried and regressed** (Karibi 2026-06-25: KIBA replied to
  each photo separately). 1200 is below the known-bad value. Shipped the tunable knob
  instead so it can be stepped down in Render under observation. The vision win is
  not here anyway — 3s of a 15s turn; the other 7-11s is `AI_VISION_MODEL` generation.
- **Intake prompt caching.** Assessed and rejected: the largest contiguous static run
  is ~9.7k chars and sits mid-prompt; Haiku 4.5's cache minimum is 4,096 tokens
  (~16k chars). Getting a cacheable block means restructuring a ~37k-char
  conversion-critical prompt and inverting its "above" / "step N" cross-references —
  and `intake-prompt.spec.ts` has **no size assertions and no ordering assertions**,
  so a reordering regression would be caught by nothing. Buys $0 latency (finding 1).
- **Caching `hasOptedOut()`** (~200ms of `sendMs`). It is the STOP/opt-out compliance
  gate and fails closed by design. With A2P already rejected once, 200ms is not worth
  the risk of messaging someone who opted out.

### Gotcha for next time

The coaching prompt char budget measures the **assembled** prompt from
`buildSystemPrompt()` (36,400 ceiling), *not* `COACHING_STATIC_RULES` alone —
measuring the constant gave a false 455 chars of headroom and the first edit
tripped the test. The test comment says compress rather than raise; complied.

## Outcome

- ✅ Impact: first real latency measurement in the project's life; one wrong
  recommendation caught and reversed before it shipped; the p90 tail (~2.4s of
  generation) targeted at its actual source.
- 🧪 Tests: `tsc --noEmit` clean; full unit suite 104 suites / 1391 tests passing.
- 📁 Files: 5 source/test files + DEPLOYING.md.
- 🔁 Next prompts: run `scripts/sim-vision.ts` and take the vision model decision
  (the real 7-11s); step `MESSAGE_IMAGE_DEBOUNCE_MS` down in Render under watch;
  re-read `turn_latency` in a week to confirm the output-token p90 actually dropped.
- 🧠 Reflection: the A/B that overturned my own prior recommendation was the highest-
  value thing in the session. Reasoning from code had produced a confident, wrong
  ranking twice in a row.

## Evaluation notes (flywheel)

- Failure modes observed: (a) recommended prompt caching as a latency fix on
  plausible reasoning — measurement showed no latency effect at all; (b) measured
  the prompt budget against the wrong string and broke the test; (c) was about to
  ship the requested 1200ms debounce until the code comment surfaced the prior
  regression at 1.5s. All three were caught by checking rather than by reasoning.
- Graders run and results (PASS/FAIL): unit suite PASS (1391/1391)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): pull `turn_latency` again in 7 days and
  compare the `outputTokens` p90 against today's 298 — that is the single number
  that says whether the prompt cap held on Haiku, or whether it needs to become code.
