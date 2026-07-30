---
id: 066
title: Latency fixes shipped, streaming blocked by guard chain
stage: general
date: 2026-07-30
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (chat)
labels: ["latency", "performance", "messaging", "streaming", "guards"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/messaging/coaching.processor.ts (modified)
tests:
 - npx tsc --noEmit -p tsconfig.json — clean
 - npx jest — 108 suites / 1419 tests pass; only tests/integration/onboarding.integration.spec.ts fails (needs live DATABASE_URL + STRIPE_SECRET_KEY — known baseline)
---

## Prompt

go

## Response snapshot

Approval to build tiers 1 + 2 + 4 from the previous turn's plan.

**Shipped (backend/src/messaging/coaching.processor.ts):**

1. **Inter-bubble cadence now accounts for the send itself.** The loop slept the
   full `MESSAGE_BUBBLE_DELAY_MS` *after* awaiting `send()`, but `send()` costs an
   opt-out query plus a provider round-trip (~200–400ms), so each gap silently
   cost `delay + send`. Now sleeps `max(0, delayMs - sendElapsed)` — the knob
   means total cadence, which is what it always read as. Sends stay strictly
   sequential; firing them concurrently would race provider ordering, which is
   the one guarantee that loop exists for. Saves ~600–800ms on a 3-bubble reply.

2. **`last_active_at` no longer blocks the turn.** It was an awaited Postgres
   round-trip sitting directly in front of the model call, for a column only the
   dashboard and re-engagement scheduler read. Now fire-and-forget with a caught
   rejection. Saves ~100–200ms on every turn.

**NOT shipped — the streaming plan was wrong, and this is the important finding.**

I proposed streaming the completion and flushing bubble 1 at the first `\n\n`.
Having now read the post-generation guard chain (`coaching.service.ts:1340–1500+`),
that is not safe as described. Every guard runs on the **complete** `finalReply`:
stamp-leak strip, `correctTimeClaims`, `correctEventTimingClaims`,
`correctWeekdayClaims`, `capBoardDump`, `correctArithmeticClaims`,
`correctWeightClaims`, `enforceCancellationPath`, and the reminder-promise guard.
Shipping bubble 1 before they run means shipping un-guarded text — precisely the
bug class this codebase has been burned by (fabricated weight deltas, false
"reminder is set" promises, the 14-item board dump).

Audited each guard for prefix-safety:

| Guard | Prefix-safe? |
|---|---|
| stamp-leak strip | yes (prefix-only by construction) |
| `correctTimeClaims` | yes (per-claim) |
| `correctEventTimingClaims` | yes (per-claim) |
| `correctWeekdayClaims` | yes (per-claim) |
| `correctArithmeticClaims` | yes (per-sentence) |
| `correctWeightClaims` | yes (per-claim) |
| `enforceCancellationPath` | yes (appends; can still append to the last bubble) |
| **`capBoardDump`** | **no** — counts list lines across the whole reply |
| **reminder-promise guard** | **no** — verdict depends on whether a tool ran, known only after the loop |

So an early first bubble is only sound when the prefix contains no list lines
**and** the turn used no tools. That fast path is real and would cover most plain
conversational turns, but it is a deliberate guard-bypass surface — flagged for
the user's decision rather than built.

Also confirmed there is **no typing-indicator support anywhere** in
`backend/src/messaging`. SendBlue exposes one; it is iMessage-only but would cut
*perceived* dead air to ~200ms without touching the guard chain. Proposed as the
better next move than the streaming fast path.

## Outcome

- ✅ Impact: ~700–1000ms off a typical 3-bubble reply, with no behaviour change and no guard weakened. Corrected a plan I had given before reading the guard chain.
- 🧪 Tests: typecheck clean; 1419 unit tests pass; only the live-DB integration suite fails, which is the known baseline.
- 📁 Files: `backend/src/messaging/coaching.processor.ts` (two edits). Uncommitted.
- 🔁 Next prompts: decide between (a) SendBlue typing indicator, (b) the no-list/no-tool early-bubble fast path, (c) shortening replies; and give a number for `MESSAGE_BUBBLE_DELAY_MS`.
- 🧠 Reflection: the latency plan was written from the send path and the model call; the guard chain is what actually forbids speaking early. Reading the *constraint* before promising the *fix* would have caught it — the ranked plan named streaming as the biggest win when it was in fact unavailable.

## Evaluation notes (flywheel)

- Failure modes observed: proposed an optimisation that a safety-critical downstream stage forbids; caught only on implementation. Guard chains that run at the end of a pipeline are invisible to a plan written from the front of it.
- Graders run and results (PASS/FAIL): PASS — tsc clean, unit suite green at baseline.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): SendBlue typing indicator on inbound-webhook receipt, measured against the existing `debounceMs`/`genMs`/`sendMs`/`totalMs` structured log.
