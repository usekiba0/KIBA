---
id: "002"
title: RYKE AI MVP Phase 1 Implementation Plan
stage: plan
date: 2026-04-29
surface: agent
model: claude-sonnet-4-6
feature: 001-sms-ai-coaching
branch: 001-sms-ai-coaching
user: Sumair Roudani
command: /sp.plan
labels: ["plan","nestjs","twilio","stripe","claude-api","crisis-detection","session-context","mms","postgresql","redis"]
links:
  spec: specs/001-sms-ai-coaching/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - specs/001-sms-ai-coaching/plan.md
  - specs/001-sms-ai-coaching/research.md
  - specs/001-sms-ai-coaching/data-model.md
  - specs/001-sms-ai-coaching/quickstart.md
  - specs/001-sms-ai-coaching/contracts/openapi.yaml
  - specs/001-sms-ai-coaching/contracts/twilio-webhook.md
  - specs/001-sms-ai-coaching/contracts/stripe-webhook.md
tests:
  - contract: twilio webhook signature validation
  - contract: claude api message format + structured outputs
  - contract: stripe setup intent + subscription creation
  - contract: postgresql entity migrations
  - integration: onboarding form → stripe → welcome SMS
  - integration: inbound SMS → claude → outbound SMS
  - integration: MMS food photo → claude vision → nutritional response
  - integration: crisis signal → holding message → coach alert
---

## Prompt

/sp.plan (no additional args — runs against current branch spec: specs/001-sms-ai-coaching/spec.md)

## Response snapshot

Completed full Phase 0 + Phase 1 planning for RYKE AI MVP.

**Phase 0 — Research (3 parallel agents):**
- ML crisis detection: Hybrid Claude API + Transformers.js BERT. Confidence threshold 0.65. Async BullMQ. ~$0.21/1K messages.
- Stripe + Claude Vision: SetupIntent → Subscription (trial_period_days:30). Claude Haiku vision via URL reference. ~$0.000002–$0.000004/image. Structured JSON output.
- Twilio webhooks + session context: TwilioWebhookGuard, empty 200 response, BullMQ async. Redis sliding window (20 msgs, 4h TTL) + PostgreSQL summaries.

**Phase 1 — Artifacts:**
- `plan.md`: Technical context, constitution check (all 10 gates PASS), 5-module NestJS structure, 3 ADR flags
- `research.md`: 8 research decisions with rationale, alternatives, cost estimates (~$280/mo at 100 users)
- `data-model.md`: 7 entities (User, Subscription, ConversationSession, Message, NutritionalAnalysis, CrisisAlert, SessionSummary), Redis schema, state transitions
- `contracts/openapi.yaml`: 4 REST endpoints (setup-intent, submit, webhooks/sms, webhooks/stripe)
- `contracts/twilio-webhook.md`: Full inbound SMS/MMS contract with processing flow and error handling
- `contracts/stripe-webhook.md`: 6 Stripe events with actions and idempotency pattern
- `quickstart.md`: End-to-end local setup guide, test scripts for all 3 primary flows

**Agent context**: CLAUDE.md updated with TypeScript 5.x, Node.js 20 LTS, PostgreSQL 15, Redis 7.

## Outcome

- ✅ Impact: Complete implementation blueprint ready for /sp.tasks. All NEEDS CLARIFICATION resolved. All constitution gates pass.
- 🧪 Tests: 4 contract tests + 4 integration tests defined in quickstart and contracts
- 📁 Files: 7 artifacts created across specs/001-sms-ai-coaching/
- 🔁 Next prompts: /sp.tasks — generate dependency-ordered task list for implementation
- 🧠 Reflection: Three ADRs flagged (Stripe, crisis detection model, session context strategy) — awaiting user consent. Twilio SMS dominates cost (~$150/mo of $280 total) at MVP scale, validating the onboarding form decision to reduce discovery messages.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): Constitution check — all 10 gates PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): Consider splitting MessagingModule into InboundModule + OutboundModule for cleaner testability isolation
