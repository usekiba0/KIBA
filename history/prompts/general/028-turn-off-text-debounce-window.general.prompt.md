---
id: 028
title: Turn off the text debounce window
stage: general
date: 2026-07-21
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: fix/remove-text-debounce
user: usekiba0
command: none
labels: ["messaging", "latency", "debounce"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/messaging/message-debouncer.service.ts
 - backend/tests/unit/message-debouncer.service.spec.ts
tests:
 - backend/tests/unit/message-debouncer.service.spec.ts (10 pass)
 - full unit suite: 1015 pass / 76 suites
---

## Prompt

But I was gonna tell you, bro there's an error 🚨 Do you know how you said you set a delay so that it reads multiple messages? It still isn't reading multiple messages during that delay - u can test it it still responds in increments regardless so let's just turn that off and have no delay

## Response

Confirmed the report and set `TEXT_DEBOUNCE_MS` from 1500 → 0. `IMAGE_DEBOUNCE_MS` stays at 3000.

**Why the window wasn't working.** The debouncer itself is correct — it merges, dedupes and sorts. The problem is the window is shorter than real human bubble gaps (3-8s), so in practice nearly every text flushed alone. It was paying full latency cost on the common case (one message) for a merge that almost never fired.

**Why a longer window is not the fix.** Widening it to actually catch a burst would add that same delay to every lone message, which is the wrong trade on a product judged on feeling instant. And it still would not stop per-bubble replies: once a batch flushes, generation takes 5-10s, and anything arriving during that window starts a *second concurrent turn* regardless of the timer. Reading a burst as one turn needs per-user serialization — hold or supersede an in-flight turn when new inbound lands — not a bigger timer.

**Image window kept.** Photo webhooks genuinely land 1-3s apart, so 3s does merge them. Removing it would regress the multi-photo-spam bug fixed 2026-06-25.

### Acceptance
- [x] `debounceDelayFor` returns 0 for text-only, 3000 when any message has media
- [x] Same-tick text webhooks still merge (merge path stays covered)
- [x] Two texts separated by a flush produce two turns (pinned, so nobody reads it as a regression)
- [x] Image batching, dedup-by-uniqueId, dateSent sort all unchanged
- [x] `tsc --noEmit` clean; 1015 unit tests pass

### Follow-ups / risks
- Concurrent turns per user are now more likely for fast typers. Pre-existing (any gap > 1.5s already did this), just more frequent. The DB `23505` guard stops duplicate *webhooks*, not two distinct messages generating in parallel.
- Real fix for "responds in increments" is a per-user in-flight lock in `CoachingProcessor.process` that supersedes rather than races. Not built — needs a product call on hold-vs-supersede.
