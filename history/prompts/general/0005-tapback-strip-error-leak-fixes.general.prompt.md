---
id: 0005
title: Tapback strip + error-leak sanitization
stage: green
date: 2026-06-17
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: fix/inbound-tapback-and-error-leak
user: usekiba0
command: general chat
labels: ["phase1", "messaging", "imessage", "tapback", "error-handling", "safety", "issues-doc-reverify"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/src/messaging/inbound-reaction.ts (new — isInboundReaction tapback detector)
  - backend/src/messaging/messaging.controller.ts (drop reactions in both webhook handlers)
  - backend/src/ai/coaching.service.ts (sanitize tool-dispatch catch block; log real cause)
  - backend/src/ai/prompts/coaching.prompt.ts (CORE-RULES guardrail vs technical/internal leaks)
  - backend/tests/unit/inbound-reaction.spec.ts (new — 15 cases)
  - backend/tests/unit/coaching.prompt.spec.ts (guardrail assertion)
tests:
  - "jest unit: 65 suites / 619 tests passing; tsc clean. 6 integration failures are DB-only (getaddrinfo ENOTFOUND, no live Postgres) — pre-existing, unrelated."
commits:
  - "7916b3b fix(messaging,coaching): drop inbound tapbacks + sanitize tool errors"
---

## Prompt

> lets start

(Context: client dropped "Issues w KIBA ai.docx" + a 2026-05-13 transcript. After
triage + a 4-agent re-verification against current master, most complaints were
already fixed post-5/15. User asked to confirm each residual was Phase 1, then
"lets start" on the two clean Phase-1 fixes: inbound tapback stripping + error-leak.)

## Response

Shipped the two unambiguous Phase-1 bug/safety fixes from the re-verified residual list:

1. **Inbound tapback stripping** — new `isInboundReaction()` util detects iMessage
   reaction text (Liked/Loved/Disliked/Laughed at/Emphasized/Questioned + curly
   quotes + "Removed a/an ... from" undo form; requires the quoted segment so real
   messages like "Loved it!" are never caught). Both webhook handlers (SendBlue +
   Twilio) drop a reaction when there's no media, logging `inbound_reaction_ignored`
   instead of spending an AI turn. Fixes the "you just liked the message twice" loop.

2. **Error-leak sanitization** — the tool-dispatch catch block in `runChat` was
   JSON-stringifying raw `err.message` into the model's tool_result context (the
   "database lag" leak vector). Now logs the real cause for us and feeds the model a
   generic `{ ok:false, error:'action_failed', note:... }` recovery instruction. Added
   a CORE-RULES line forbidding any mention of errors/servers/databases/lag/tools/APIs
   in user-facing replies (also covers the doc's "make it sound human" ask).

tsc clean; 619 unit tests pass (new inbound-reaction spec + prompt guardrail assertion).
Committed on branch fix/inbound-tapback-and-error-leak; not yet pushed/PR'd.

## Follow-ups / risks

- Remaining residuals are product DECISIONS, not bugs: reminders-during-intake,
  mandatory photo-proof, payment-gate A/B — all Phase 1 scope but need Karibi's call.
  Latency/prompt-caching is a Phase-1 perf lever still open. Per [[feedback_stay_in_phase1]]
  do not extend proof to GPS/health (Phase 2).
- Tapback detection is text-pattern based (SendBlue sends no structured reaction flag);
  if SendBlue ever changes the rendered wording the regex needs updating.
- Sanitization only covers the catch path; handler-returned `{ ok:false, error }` strings
  (e.g. "stripe checkout creation failed") still pass through — mostly user-safe and now
  also shielded by the prompt guardrail.
