---
id: 070
title: Tomo "fast compare" video — measured latency vs KIBA
stage: general
date: 2026-07-30
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (freeform)
labels: ["latency", "competitor-analysis", "sendblue", "video-analysis", "perceived-latency"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/kiba/pull/59
files:
  - "faast compare .mp4 (analysed, not modified)"
  - "history/prompts/general/070-tomo-fast-compare-video-latency.general.prompt.md"
tests:
  - none (analysis only, no code changed)
---

## Prompt

check the video called fast compare. client is saying how can we make it that fast. Can chagne ot server config or something speed up

## Response snapshot

### What the video actually is

`faast compare .mp4` — 13.63s, 576x1248, 60fps iPhone screen recording. **Tomo only, not a
side-by-side.** iMessage thread (blue outbound bubbles).

Frame-accurate timings, obtained by cropping out the keyboard and running ffmpeg scene
detection on the message area (`crop=576:700:0:60,select='gt(scene,0.006)',showinfo`):

| t | Event |
|---|---|
| 1.35s | user sends "Yooo" |
| 2.53s | **read receipt appears** |
| 5.13s | bubble 1 — "yooo, what's the move today?" (28 chars) |
| 5.95s | typing indicator |
| 7.00s | bubble 2 — "we locking back in on those ad scales or hitting a hypertrophy session first?" (76 chars) |
| 10.8s | user sends "Abt to get food" |
| 13.63s | **video ends — Tomo has not replied. 2.8s of silence at cutoff.** |

**Real number: 3.8s to first bubble.** Not instant. It *feels* instant because the read
receipt lands at 1.2s, so dead air is 1.2s, not 3.8s. Tomo's own scrollback contains a
180-char message, so it is not uniformly terse either.

### The key finding: same transport

Tomo is on iMessage. **KIBA is also on SendBlue iMessage** (`messaging.service.ts:239`),
with Twilio SMS only as fallback. So this is not an Apple-vs-carrier gap — it is winnable.

⚠️ **But:** if the client's test handset falls back to Twilio SMS, that alone explains the
gap and no amount of tuning closes it (carrier 1-3s + no typing indicator + no read
receipt). Must confirm which channel his test number used before anything else.

### Answer to "can server config speed it up"

Mostly **no** — a bigger Render instance moves nothing, because the wait is not CPU-bound.
It is time spent waiting on the Anthropic API and on SendBlue. Three infrastructure items
are real exceptions:

1. **SendBlue account features** (biggest perceived win). `sendReadReceipt()`
   (`messaging.service.ts:295-335`) and `sendTypingIndicator()` (`:364-403`, PR #59) are
   both coded and both require **manual activation on the SendBlue account** — endpoint
   returns 200 either way, so we cannot tell from logs whether they fire. Unconfirmed.
   This is exactly the 1.2s feedback that makes Tomo look fast.
2. **Render plan / spin-down.** No `render.yaml` in the repo — plan, region and instance
   type are dashboard-only and invisible to code review. Free tier spins down after 15 min
   idle with ~50s cold start, and `migrationsRun: true` (`app.module.ts:92-110`) runs on
   every boot. Worse, the debouncer buffers inbound messages in an in-process `Map` and
   calls `coachingProcessor.process()` directly — a spin-down mid-debounce drops them.
3. **Postgres region colocation.** ~7 sequential awaited DB round-trips run before the
   model call. Cross-region = 350-700ms of pure waste. Region is not recorded anywhere.

### The real levers, ranked

1. **Reply length.** `genMs` ≈ output length. `max_tokens: 512` (`coaching.service.ts:1173`)
   ≈ a 2,000-char ceiling; Tomo's winning reply was **28 chars**. Largest single lever.
2. **Read receipt + typing indicator activation** (above).
3. **Intake path has no prompt caching.** `generateIntakeReply()`
   (`coaching.service.ts:926-948`) builds a plain string — the ~58KB intake prompt is
   re-read uncached every intake turn. The coaching path is cached correctly
   (`:864-871`, 35,853 chars ≈ 10k tokens behind one `cache_control` breakpoint).
4. **Tool turns.** `MAX_TOOL_ITERATIONS = 3` (`:503`) → up to 4 sequential model calls.
   These are the >10s outliers, already known.
5. **Photo turns** eat a hardcoded `IMAGE_DEBOUNCE_MS = 3000`
   (`message-debouncer.service.ts:31`). Text debounce is already 0.

Already spent: `MESSAGE_BUBBLE_DELAY_MS` 1200 → 700 → 350, and the sleep is now
`max(0, delay - sendElapsed)` rather than additive. Model is already Haiku 4.5.
Streaming is closed — the whole-reply guard chain forbids it (PR #59).

### Headline recommendation

**Measure before tuning.** `turn_latency` has been emitting `debounceMs` / `genMs` /
`sendMs` / `e2eMs` on all three paths (`coaching.processor.ts:899`, `:1188`, `:1259`)
since 2026-07-20 and **nobody has ever read it.** There is no sink, no dashboard, no
aggregation — just Render stdout. Every tuning decision to date, including PR #59, was
reasoned from code with zero production measurement. One day of prod logs settles whether
the gap is generation, DB hops, cold start, or SMS fallback.

## Outcome

- ✅ Impact: gave the client a defensible number (Tomo = 3.8s, not instant) and separated
  the one infrastructure item that matters (SendBlue read-receipt/typing activation) from
  the ones that do not (instance size). No code changed.
- 🧪 Tests: none — analysis only.
- 📁 Files: none modified; video analysed via ffmpeg into the session scratchpad.
- 🔁 Next prompts: confirm the client's test channel (iMessage vs SMS fallback); pull one
  day of prod `turn_latency` from Render; confirm SendBlue account activation status.
- 🧠 Reflection: the instinct to reach for server config was wrong, but the instinct that
  we were losing on *something* was right — it is reply length and the missing read
  receipt, both cheap.

## Evaluation notes (flywheel)

- Failure modes observed: the video was assumed to be a side-by-side comparison; it is
  single-sided. Reading it frame-by-frame rather than trusting the filename changed the
  answer. Also: "how is it so fast" turned out to have a measurable answer (3.8s) that
  undercut the premise.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): read one day of prod `turn_latency` logs and
  compare `genMs` against reply `tokenCount` — confirms or kills the reply-length thesis
  for the cost of one log query.
