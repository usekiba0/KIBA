---
id: 038
title: Reminder cancel forensics fixes
stage: green
date: 2026-07-23
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: fix/reminder-cancel-forensics-and-link-visibility
user: usekiba0
command: none
labels: ["reminders", "payment-link", "visibility", "tdd", "audit-followup"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/41
files:
  - backend/src/accountability/schedule.service.ts
  - backend/src/accountability/reminder-content.ts
  - backend/src/messaging/coaching.processor.ts
  - backend/src/data/admin.controller.ts
  - backend/src/data/outbound-recorder.service.ts
  - backend/scripts/cleanup-orphan-jobs-and-dup-reminders.js
  - backend/tests/unit/schedule-cancel.spec.ts (new)
  - backend/tests/unit/payment-link-recording.spec.ts (new)
  - backend/tests/unit/reminder-content.spec.ts
  - backend/tests/unit/schedule.service.spec.ts
tests:
  - 15 new tests (TDD red-first): cancel actor/reason, daily-chain skip-vs-kill re-arm, cancelSeries no-rearm, same-minute same-intent supersede + negative cases, sameIntentOneShot fixtures (literal prod strings), payment-link thread recording incl. failure paths
  - Full unit suite 1181 passed / 87 suites; tsc --noEmit clean; lint 0 errors (2 pre-existing-style warnings)
---

## Prompt

go ahead with the code fixes

## Response

Implemented the four audit-forensics fixes TDD-style (red verified before each implementation) and opened PR #41:

1. sendPaymentLink now records lead-in + plan URL to the thread via OutboundRecorder with new 'payment_link' kind (extends PR #33 to the one sender it missed; best-effort, never blocks the send or the PAYMENT_PENDING flip). Root cause of the Najee/Sam false-alarm "dropped lead" audit findings.
2. ScheduleService.cancel() takes CancelOpts {actor, reason, killChain} — writes failure_reason, emits reminder_cancelled structured log. Actors wired: admin (controller), ai_tool (tool handler), supersede (enqueue).
3. Chain survival: cancelling one occurrence of a daily chain re-arms tomorrow (re-arm extracted from fire() into shared rearmDailyChain helper) unless explicitly killed (cancelSeries / killChain / new admin DELETE ?series=true). Fixes the 07-22 chain-death incident class.
4. sameIntentOneShot() content-overlap check in reminder-content.ts; enqueue's supersede path now also merges exact-same-minute same-intent one-shot dups (the 07-23 tailor typo-re-confirm dup). Distinct intents at a shared minute always kept.

Also fixed cleanup-orphan-jobs-and-dup-reminders.js dup grouping to key on (user, local_time, normalized message) — time-only grouping would have deleted one of two different-purpose 9am chains; script cancels now stamp failure_reason.

Behavior change flagged in PR: admin single-row DELETE on a chain row now skips a day instead of killing the chain (series kill = ?series=true).
