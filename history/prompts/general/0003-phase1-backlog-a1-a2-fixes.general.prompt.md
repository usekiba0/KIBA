---
id: 0003
title: Phase 1 backlog A1 dunning + A2 token-noise
stage: green
date: 2026-06-04
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: feat/multi-goal-pipeline
user: usekiba0
command: general chat
labels: ["phase1", "dunning", "stripe", "logging", "cost"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/src/common/logger.ts (warnTokenBudget ceiling 4k->20k, env TOKEN_BUDGET_WARN_TOKENS)
  - backend/.env.example (document TOKEN_BUDGET_WARN_TOKENS)
  - backend/tests/unit/logger.spec.ts (new)
  - backend/tests/unit/checkin.processor.spec.ts (added dunning regen regression tests)
tests:
  - "jest unit: 48 suites / 428 tests passing; tsc clean"
commits:
  - "75bca31 fix(logger): raise token-budget warn ceiling 4k -> 20k (env-tunable)"
---

## Prompt

> yes

(Approving the offer to verify + fix Phase 1 backlog items A1 (dunning nudge dead-link) and A2 (token-budget warn noise) against current code.)

## Response

- **A1 — already fixed in code.** `CheckinProcessor.handlePaymentLinkNudge` calls `regenerateCheckoutLink()`: fresh Stripe checkout session per nudge, sent on its own line, reply-CTA fallback on Stripe failure. The open-issues note was stale. Added 3 regression tests to checkin.processor.spec.ts (fresh-link sent, fallback on failure, no-op once paid). No source change.
- **A2 — fixed.** Raised `warnTokenBudget` ceiling 4000 → default 20000, env-tunable via `TOKEN_BUDGET_WARN_TOKENS`, logs active threshold; documented in .env.example. Root cause: no prompt caching, so every coaching turn's uncached ~5k system prompt + history exceeded 4k → warned every message. Added logger.spec.ts (silent at ~6k, warns >20k, env override).
- Stayed strictly Phase 1 per the standing guardrail. Updated open-issues memory marking #1 and #3 resolved.

## Follow-ups / risks

- Remaining Phase 1 backlog: deterministic payment-link send (optional), confirm stuck lead +923394018067 converted, Night Recap build (only Phase-1 V1-spec gap).
- 20000 is a heuristic ceiling; tune from real logs via env if it's too quiet/noisy.
