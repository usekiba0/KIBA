---
id: 065
title: SMS reply latency — target milliseconds
stage: general
date: 2026-07-30
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (chat)
labels: ["latency", "performance", "messaging", "streaming"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/messaging/coaching.processor.ts (read)
 - backend/src/messaging/message-debouncer.service.ts (read)
 - backend/src/messaging/messaging.service.ts (read)
 - backend/src/ai/coaching.service.ts (read)
 - backend/src/ai/model-params.ts (read)
tests:
 - none run (analysis only)
---

## Prompt

man it take a very long time to receive a response i need it in milli seconds

## Response snapshot

Clarified the target: KIBA's SMS replies to users (not Claude Code's own turnaround).

Traced the full inbound→outbound path and split the latency budget:

- **debounce** — `message-debouncer.service.ts:43` `TEXT_DEBOUNCE_MS = 0`, `IMAGE_DEBOUNCE_MS = 3000`. Text turns pay nothing here; photo turns pay 3s by design.
- **pre-generation DB** — 5+ sequential Postgres round-trips before the model is
  even called: user lookup, `last_active_at` update (awaited, needn't be),
  cross-channel dedup query, session-boundary check + record, inbound message
  save. (`coaching.processor.ts:388–470`)
- **generation** — `coaching.service.ts:1171` is an explicitly **non-streaming**
  `messages.create` (`MessageCreateParamsNonStreaming`), `max_tokens: 512`, model
  `AI_MODEL` default `claude-haiku-4-5-20251001`. Nothing is sent until the whole
  completion lands, so gen time scales with total reply length — matching the
  earlier measurement that gen time ≈ reply length. Tool turns run the loop again
  (`MAX_TOOL_ITERATIONS`), doubling it; the interim-text send added 2026-07-28
  masks but does not remove this.
- **send** — `coaching.processor.ts:2172–2180`: per bubble, one `hasOptedOut` DB
  query + one provider HTTP call, all awaited **serially**, plus
  `MESSAGE_BUBBLE_DELAY_MS` (default 700) slept between bubbles. A 3-bubble reply
  pays 1.4s of pure sleep on top of 3 serial round-trips.
- **carrier** — SendBlue/Twilio → handset, ~1–3s, not ours.

Stated plainly that milliseconds end-to-end is not reachable: carrier delivery
alone is ~1–3s and sits outside our code. The reachable target is
**time-to-first-bubble**, and the dominant lever is streaming the completion so
bubble 1 ships at the first paragraph break instead of after the last token.

Ranked plan presented (streaming; parallelise send + inter-bubble sleep; drop the
bubble-delay knob; un-await `last_active_at` and collapse the pre-gen queries;
shorten replies). No code changed — waiting on the user's go and on the
product-feel call about `MESSAGE_BUBBLE_DELAY_MS`, which Karibi already tuned
once (1200 → 700 on 2026-07-28).

## Outcome

- ✅ Impact: Latency budget attributed to specific lines; identified non-streaming generation as the dominant controllable cost and named the carrier floor that makes "milliseconds" unachievable.
- 🧪 Tests: none run — read-only analysis.
- 📁 Files: no files modified.
- 🔁 Next prompts: approve tier 1 (streaming first-bubble) + tier 2 (parallel send/sleep, un-awaited `last_active_at`); decide the `MESSAGE_BUBBLE_DELAY_MS` value.
- 🧠 Reflection: the 2026-07-28 pass tuned the *knobs* (1200→700ms bubble delay, interim tool text) but left the *structure* — a blocking, non-streamed generation — untouched. That structure is where the remaining seconds live.

## Evaluation notes (flywheel)

- Failure modes observed: the ask ("milliseconds") is unachievable as literally stated; answering it required naming the physical floor rather than agreeing to it.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): stream `messages.create` and flush bubble 1 on the first `\n\n`, measuring time-to-first-bubble against the existing `genMs`/`sendMs`/`totalMs` structured log.
