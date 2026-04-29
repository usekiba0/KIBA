# Implementation Plan: RYKE AI MVP — Phase 1: SMS-First AI Coaching

**Branch**: `001-sms-ai-coaching` | **Date**: 2026-04-29 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/001-sms-ai-coaching/spec.md`

---

## Summary

RYKE AI Phase 1 delivers an SMS-first AI coaching platform: users complete a structured web onboarding form (goals, health info, body metrics, payment), receive a personalised welcome SMS within 30 seconds, and interact with an AI coach entirely over SMS/MMS. The platform uses NestJS (TypeScript) with three strict layers — Messaging (Twilio), AI (Claude API), Data (PostgreSQL + Redis) — enforcing constitution-mandated separation of concerns. Key differentiators: MMS photo nutrition analysis via Claude Vision, ML-based crisis detection with human handoff, and context-aware coaching via a Redis sliding window with PostgreSQL-persisted session summaries.

---

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 LTS  
**Backend Framework**: NestJS 10 (modular architecture enforcing 3-layer separation)  
**Frontend Framework**: Next.js 14 (App Router) — landing page + onboarding form only  
**AI Engine**: Claude API — `claude-haiku-4-5` (coaching, vision, summarisation), `claude-sonnet-4-6` (via `AI_MODEL` env override for higher accuracy)  
**Crisis Detection**: Hybrid — Claude API classifier (primary) + Transformers.js local BERT (`Amalq/mental-health-roberta-large`) as fast-path/fallback  
**Messaging**: Twilio SMS/MMS (Android + non-iPhone) + SendBlue iMessage API (iPhone users, auto SMS fallback)  
**Payment**: Stripe (SetupIntent → Subscription with 30-day free trial)  
**Storage**: PostgreSQL 15 (primary durable store) + Redis 7 (session cache, BullMQ queues)  
**Testing**: Jest + Supertest (unit + integration); contract tests for Twilio, Claude, Stripe, PostgreSQL  
**Target Platform**: AWS EC2 (NestJS backend), AWS RDS PostgreSQL, AWS ElastiCache Redis; Next.js on Vercel  
**Containerisation**: Docker + Docker Compose for local dev; not mandatory for initial deploy  
**Performance Goals**: SMS reply < 10s p95; MMS nutrition analysis < 15s p95; welcome SMS < 30s; crisis holding message < 3s  
**Constraints**: Session boundary = 4h inactivity (configurable via `SESSION_TIMEOUT_HOURS`); token budget < 500/turn (Crisis classification async, not on critical path); 99.5% SMS uptime  
**Scale/Scope**: Phase 1 target — 100–500 active users; architecture must support horizontal scaling of message workers without code changes

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked post-design below.*

| Gate | Status | Evidence |
|------|--------|----------|
| **SMS-First Gate** | ✅ PASS | All coaching delivered via Twilio SMS/MMS (Android) + SendBlue iMessage (iPhone). Landing page is sign-up only. No coaching in web portal. |
| **Safety Gate** | ✅ PASS | Crisis detection mandatory in every deployment. Holding message < 3s. Coach alert < 5min. Cannot be disabled by config. SafetyModule present in all environments. |
| **Privacy Gate** | ✅ PASS | TLS 1.2+ in transit. PostgreSQL at-rest encryption. Stripe tokenisation — raw card data never stored. Health data delete endpoint implemented. No third-party data sharing. |
| **Extensibility Gate** | ✅ PASS | Health entity schema is source-agnostic (no device-specific fields). Wearable adapter interfaces defined (not implemented). |
| **Observability Gate** | ✅ PASS | Structured logs on every service operation: inbound message, AI response, Stripe event, handoff event. Token usage logged per turn. |
| **MVP Scope Gate** | ✅ PASS | No coach dashboard, no wearables, no multi-channel, no advanced analytics. Re-engagement messaging deferred. All out-of-scope items confirmed excluded. |
| **Test-First Gate** | ✅ PASS | Given/When/Then scenarios defined in spec per user story. Contract tests required for Twilio, Claude, Stripe, PostgreSQL before implementation. |
| **Token-Efficiency Gate** | ✅ PASS | System prompt estimated ~300 tokens. Sliding window 20 messages ~15k tokens. Crisis classifier prompt ~150 tokens + caching. All within 500-token coaching turn budget on average. |
| **Separation of Concerns Gate** | ✅ PASS | MessagingModule (Twilio only) / AiModule (Claude only) / DataModule (DB only). No cross-layer direct calls. Each module independently deployable and testable. |
| **Zero-Friction Gate** | ✅ PASS | Phone number → welcome SMS < 30s. No email, password, or app download. Onboarding form is the only web step before coaching begins. |

**Post-Design Re-check**: All gates pass. No violations requiring justification.

---

## Project Structure

### Documentation (this feature)

```text
specs/001-sms-ai-coaching/
├── plan.md              ← This file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/           ← Phase 1 output
│   ├── openapi.yaml
│   ├── twilio-webhook.md
│   └── stripe-webhook.md
└── tasks.md             ← Phase 2 output (/sp.tasks)
```

### Source Code (repository root)

```text
# Web application: Next.js frontend + NestJS backend

backend/
├── src/
│   ├── app.module.ts                    # Root module
│   ├── main.ts                          # Bootstrap (rawBody: true, urlencoded)
│   │
│   ├── messaging/                       # Layer 1: Messaging (Twilio only)
│   │   ├── messaging.module.ts
│   │   ├── messaging.service.ts         # Outbound SMS/MMS via BullMQ
│   │   ├── messaging.controller.ts      # POST /webhooks/sms (inbound)
│   │   ├── twilio-webhook.guard.ts      # Signature validation
│   │   ├── messaging.processor.ts       # BullMQ: send-sms queue worker
│   │   └── dto/
│   │       └── twilio-webhook.dto.ts
│   │
│   ├── ai/                              # Layer 2: AI (Claude only)
│   │   ├── ai.module.ts
│   │   ├── coaching.service.ts          # Build prompts + Claude API calls
│   │   ├── vision.service.ts            # MMS food photo → nutritional analysis
│   │   ├── crisis.service.ts            # ML crisis classifier (Claude + BERT)
│   │   ├── summarisation.service.ts     # Session summary generation
│   │   └── prompts/
│   │       ├── coaching.prompt.ts
│   │       ├── crisis.prompt.ts
│   │       └── summarisation.prompt.ts
│   │
│   ├── data/                            # Layer 3: Data (PostgreSQL + Redis)
│   │   ├── data.module.ts
│   │   ├── session-cache.service.ts     # Redis sliding window
│   │   ├── session-boundary.service.ts  # Session expiry + summary trigger
│   │   └── entities/
│   │       ├── user.entity.ts
│   │       ├── subscription.entity.ts
│   │       ├── conversation-session.entity.ts
│   │       ├── message.entity.ts
│   │       ├── nutritional-analysis.entity.ts
│   │       ├── crisis-alert.entity.ts
│   │       └── session-summary.entity.ts
│   │
│   ├── onboarding/                      # Orchestration: web form → Stripe → SMS
│   │   ├── onboarding.module.ts
│   │   ├── onboarding.controller.ts     # POST /onboarding/submit
│   │   ├── onboarding.service.ts
│   │   ├── stripe.service.ts            # SetupIntent + Subscription
│   │   ├── stripe-webhook.controller.ts # POST /webhooks/stripe
│   │   └── dto/
│   │       └── onboarding-form.dto.ts
│   │
│   └── safety/                          # Orchestration: crisis detection + handoff
│       ├── safety.module.ts
│       ├── safety.service.ts            # Orchestrate: classify → hold → alert
│       └── safety.processor.ts          # BullMQ: crisis-detection queue worker
│
├── tests/
│   ├── contract/
│   │   ├── twilio.contract.spec.ts
│   │   ├── claude.contract.spec.ts
│   │   ├── stripe.contract.spec.ts
│   │   └── postgres.contract.spec.ts
│   ├── integration/
│   │   ├── onboarding.integration.spec.ts
│   │   ├── sms-coaching.integration.spec.ts
│   │   ├── mms-nutrition.integration.spec.ts
│   │   └── crisis-detection.integration.spec.ts
│   └── unit/
│       ├── coaching.service.spec.ts
│       ├── crisis.service.spec.ts
│       └── session-cache.service.spec.ts
│
├── .env.example
├── docker-compose.yml                   # PostgreSQL + Redis for local dev
└── package.json

frontend/
├── src/
│   ├── app/
│   │   ├── page.tsx                     # Landing page (existing HTML → React)
│   │   ├── onboarding/
│   │   │   └── page.tsx                 # Multi-step onboarding form
│   │   └── layout.tsx
│   ├── components/
│   │   ├── OnboardingForm/
│   │   │   ├── Step1Goals.tsx           # Goals + focus area
│   │   │   ├── Step2BodyMetrics.tsx     # Height, weight, age
│   │   │   ├── Step3HealthInfo.tsx      # Conditions, injuries, dietary restrictions
│   │   │   ├── Step4Contact.tsx         # Name + phone number
│   │   │   └── Step5Payment.tsx         # Stripe Payment Element
│   │   └── ui/                          # Shared UI components
│   └── lib/
│       ├── stripe.ts                    # Stripe.js client init
│       └── api.ts                       # Backend API calls
├── public/
└── package.json
```

**Structure Decision**: Web application — Next.js frontend (Vercel) + NestJS backend (AWS). Separate deployable units matching constitution's hosting split. Three mandatory backend layers enforced as NestJS feature modules.

---

## Complexity Tracking

> No constitution violations requiring justification.

*All complexity is justified by the feature spec requirements. No speculative abstractions added.*

---

## Key Design Decisions

### D0: SendBlue for iMessage + Twilio for SMS/MMS
iPhone users receive coaching as iMessages (blue bubbles) via SendBlue API — automatic SMS fallback when iMessage is unavailable. Android and basic phone users route through Twilio as before. Both channels are abstracted behind a single `MessagingService` interface — the AI and Data layers have no knowledge of which channel is used. Inbound replies from SendBlue arrive via webhook (same pattern as Twilio). Session context is channel-agnostic — a user switching from SMS to iMessage retains full coaching history.

### D1: BullMQ for All Async Processing
All Twilio webhook responses return within 100ms. Claude API calls, crisis classification, outbound SMS, and Stripe events processed via BullMQ queues backed by Redis. This handles Twilio's 15-second timeout, prevents duplicate processing on retries, and enables horizontal scaling of workers.

### D2: Claude Haiku as Default Model
`claude-haiku-4-5` is the default for all AI operations (coaching, vision, crisis, summarisation). Overridable to `claude-sonnet-4-6` via `AI_MODEL` env var without code changes. This keeps per-turn cost near-zero while allowing quality upgrades.

### D3: Stripe SetupIntent (Not PaymentIntent)
Free trial requires saving a payment method without charging. SetupIntent is the correct primitive. PaymentIntent would initiate a charge. Subscription with `trial_period_days: 30` handles the trial lifecycle, automatic renewal, and webhook events.

### D4: Prompt Caching for Crisis Classifier
The crisis detection system prompt (~1,500 tokens) is cached using Anthropic's prompt caching. After the first request, cached reads cost 10% of normal input token price. At 25,000 messages/month this saves ~$3/month at MVP scale — more significant at growth scale.

### D5: Session Summary Written on Expiry
Rather than discarding old context when the Redis TTL expires, a Claude-generated summary (100–200 words) is written to `session_summaries` in PostgreSQL. Next session loads this as a system prompt addition. Users never lose their coaching relationship continuity.

### D6: Onboarding Form Before Welcome SMS
Spec decision: web form captures full user profile before any SMS is sent. This eliminates early-session discovery messages, reduces Twilio costs, and gives the AI rich context from message 1. The welcome SMS references the user's specific stated goal.

---

## ADR Flags (Pending User Consent)

- 📋 **Payment gateway selection**: Stripe chosen — document SetupIntent pattern, trial lifecycle, webhook handling, and alternatives considered. Run `/sp.adr stripe-payment-gateway`
- 📋 **Crisis detection hybrid model**: Claude + BERT hybrid — document accuracy/cost tradeoffs vs alternatives. Run `/sp.adr crisis-detection-model`
- 📋 **Session context strategy**: Redis sliding window + PostgreSQL summaries — document vs full-history, vector memory, summarisation-only. Run `/sp.adr session-context-strategy`
