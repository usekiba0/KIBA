---
id: 067
title: Typing indicator, bubble cadence, PR 59
stage: general
date: 2026-07-30
surface: agent
model: claude-opus-5[1m]
feature: none
branch: perf/reply-latency-and-typing-indicator
user: usekiba0
command: (chat)
labels: ["latency", "performance", "messaging", "sendblue", "typing-indicator"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/59
files:
 - backend/src/messaging/coaching.processor.ts (modified)
 - backend/src/messaging/messaging.service.ts (modified — sendTypingIndicator)
 - backend/src/messaging/messaging.controller.ts (modified — fire-and-forget on inbound)
 - backend/tests/unit/messaging-typing-indicator.spec.ts (new)
tests:
 - npx tsc --noEmit — clean
 - npx jest — 109 suites / 1424 tests pass (5 new); only tests/integration/onboarding.integration.spec.ts fails (needs live DATABASE_URL + STRIPE_SECRET_KEY — unchanged baseline)
---

## Prompt

do it

## Response snapshot

Read as yes to all three open questions from the previous turn: typing indicator,
a number for `MESSAGE_BUBBLE_DELAY_MS`, and open a PR.

**Shipped — PR #59 (`c9437af`), branch `perf/reply-latency-and-typing-indicator`:**

1. Inter-bubble cadence subtracts the send duration (from turn 066).
2. `last_active_at` un-awaited (from turn 066).
3. `MESSAGE_BUBBLE_DELAY_MS` default 700 → 350. The old number had the send time
   baked into it, so the gap users actually see stays roughly the same.
4. **`MessagingService.sendTypingIndicator()`** — new. Fired fire-and-forget from
   the SendBlue webhook handler alongside the existing `sendReadReceipt`, inside
   the same `setImmediate`. Best-effort: never throws, never blocks the webhook ack.
5. Five unit tests: payload shape, `max_duration_ms` within Sendblue's 1–300000
   range, no-op without credentials, no-op without `SENDBLUE_FROM_NUMBER`,
   swallows an API failure.

**API verified externally, not assumed.** Fetched
`docs.sendblue.com/api-v2/typing-indicators/`: `POST /api/send-typing-indicator`,
headers `sb-api-key-id` / `sb-api-secret-key`, body `number` (required),
`from_number`, `state` ("start" | "stop"), `max_duration_ms` (1–300000, default
60000). Documented host is `api.sendblue.com`; used `api.sendblue.co` to match
the origin our proven `send-message` and `mark-read` calls already use, since a
cross-host POST redirect can drop the body. No `stop` call on the reply path —
that would be an extra round-trip in front of the bubble we're speeding up, and
the outbound message clears the indicator anyway.

**DECLINED — the early-bubble fast path.** Reading `bubbles.ts` surfaced a third
non-prefix-safe stage beyond `capBoardDump` and the reminder guard:
`dedupeBubbles` (`bubbles.ts:46`) exists because the model sometimes emits its
whole reply twice (Karibi 2026-07-08, duplicate messages) — and you cannot dedupe
a bubble already sent. `send()`'s in-memory `recentSends` guard covers repeats
≥25 chars only, so short bubbles would double. Three guards deep, each from a
real incident, to buy ~800ms on a subset of turns. Not built; reasoning recorded
in the PR body so the decision survives.

Also corrected: the original streaming sketch said "flush at the first `\n\n`" —
bubbles actually split on an explicit `[pause]` marker (`bubbles.ts:22`), not
blank lines.

## Outcome

- ✅ Impact: PR #59 open. ~700–1000ms of real latency removed from a 3-bubble reply, plus the first visible feedback to the user now lands in a few hundred ms instead of after the full generation.
- 🧪 Tests: tsc clean; 1424 unit tests pass; integration baseline unchanged.
- 📁 Files: 3 modified, 1 test file added, 3 PHRs.
- 🔁 Next prompts: confirm typing indicators are activated on the Sendblue account (same manual-activation caveat as read receipts); decide whether to attack reply length, which is the only remaining lever on `genMs`.
- 🧠 Reflection: three turns in, the shape of this problem was that the *fix* lived in the send path but the *constraint* lived in the guard chain at the far end of the generation path. Each read moved the plan; the final answer (perceived latency, not real latency) is the opposite of where it started.

## Evaluation notes (flywheel)

- Failure modes observed: two successive plans proposed shipping partial replies before reading the code that forbids it. Also assumed the bubble split was on `\n\n` when it is a `[pause]` marker.
- Graders run and results (PASS/FAIL): PASS — tsc clean, 1424 unit tests green, endpoint contract verified against vendor docs rather than recalled.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): measure `genMs` against output-token count in production to size the win from shortening replies — the last remaining lever now that early-shipping is ruled out.
