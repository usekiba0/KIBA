# Implementation Plan: KIBA — Phase 1: SMS-First Psychological Accountability System

**Branch**: `001-sms-ai-coaching` | **Date**: 2026-05-09 | **Spec**: [spec.md](./spec.md)

---

## Summary

KIBA Phase 1 delivers an SMS-first psychological accountability system. Users complete a deep psychological onboarding form (goal, timeline, fears, avoidance patterns, comparison figures, pressure preference) and payment — triggering a personalised welcome SMS and an AI-generated action plan within 60 seconds. From that point, KIBA drives daily check-ins with proof requirements, logs strikes for missed tasks, maintains an Execution Score (0–100), and escalates pressure through an anti-ghosting system that prevents silent failure. The system is built on NestJS (TypeScript) with four strict modules — Messaging (Twilio/SendBlue), AI (Claude API), Data (PostgreSQL + Redis), and Accountability (strikes, score, anti-ghosting) — plus a Scheduler for daily check-in delivery.

---

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 LTS
**Backend Framework**: NestJS 10 (modular architecture)
**Frontend Framework**: Next.js 14 (App Router) — landing page + onboarding form only
**AI Engine**: Claude API — `claude-haiku-4-5` default; `claude-sonnet-4-6` via `AI_MODEL` env override
**Crisis Detection**: Hybrid — Claude API classifier (primary) + Transformers.js local BERT as fast-path fallback
**Messaging**: Twilio SMS/MMS (Android + non-iPhone) + SendBlue iMessage API (iPhone, auto SMS fallback)
**Payment**: Stripe (SetupIntent → Subscription with 30-day free trial)
**Storage**: PostgreSQL 15 (primary durable store) + Redis 7 (session cache, BullMQ queues, scheduled jobs)
**Testing**: Jest + Supertest (unit + integration); contract tests for Twilio, Claude, Stripe, PostgreSQL
**Hosting**: Render (NestJS backend + PostgreSQL), Upstash (Redis), Vercel (Next.js frontend)
**Performance Goals**: SMS reply < 10s p95; proof processing < 15s p95; welcome SMS < 30s; plan generation < 60s; crisis holding message < 3s; anti-ghost follow-up < 2h of miss
**Constraints**: Session boundary = 4h inactivity (configurable); token budget < 500/turn; anti-ghost window 1 = 2h, window 2 = 24h, window 3 = 48h (all configurable)
**Scale/Scope**: Phase 1 target — 100–500 active users; architecture must support horizontal scaling of workers without code changes

---

## Constitution Check

| Gate | Status | Evidence |
|------|--------|----------|
| **Pressure Gate** | ✅ PASS | Every check-in, anti-ghost, and strike message injects psychological profile. No generic messages allowed. |
| **No-Ghost Gate** | ✅ PASS | Anti-ghosting module fires at 2h/24h/48h. No flow allows silent exit. Reset is explicit only. |
| **Personalization Gate** | ✅ PASS | PsychologicalProfile entity stored at onboarding. Injected into every AI prompt via profile context builder. |
| **Safety Gate** | ✅ PASS | Crisis detection mandatory. Holding message < 3s. Coach alert < 5min. Cannot be disabled. Pressure suspended on crisis flag. |
| **Privacy Gate** | ✅ PASS | TLS 1.2+ in transit. PostgreSQL at-rest encryption. Stripe tokenisation only. Psychological data never sold or shared. |
| **SMS-First Gate** | ✅ PASS | All accountability interactions over SMS/iMessage. Web app is onboarding and dashboard only. |
| **Test-First Gate** | ✅ PASS | Given/When/Then scenarios defined per user story in spec. Contract tests required before implementation. |
| **Token-Efficiency Gate** | ✅ PASS | Coaching system prompt ~350 tokens (psychological profile injected surgically). Sliding window 20 messages. Crisis classifier cached. |
| **Separation of Concerns Gate** | ✅ PASS | MessagingModule / AiModule / DataModule / AccountabilityModule. No cross-layer direct calls. |
| **MVP Scope Gate** | ✅ PASS | Money Mode, Challenge Mode, Social Cards, gamification badges deferred to Phase 2. |

---

## Project Structure

### Source Code

```text
backend/
├── src/
│   ├── app.module.ts
│   ├── main.ts
│   │
│   ├── messaging/                        # Layer 1: Messaging (Twilio + SendBlue only)
│   │   ├── messaging.module.ts
│   │   ├── messaging.service.ts          # Outbound SMS/iMessage via BullMQ
│   │   ├── messaging.controller.ts       # POST /webhooks/sms + /webhooks/imessage
│   │   ├── coaching.processor.ts         # BullMQ: inbound message processing
│   │   ├── twilio-webhook.guard.ts       # Signature validation
│   │   └── dto/
│   │       └── twilio-webhook.dto.ts
│   │
│   ├── ai/                               # Layer 2: AI (Claude only)
│   │   ├── ai.module.ts
│   │   ├── coaching.service.ts           # Build prompts + Claude API calls
│   │   ├── vision.service.ts             # MMS proof photo processing
│   │   ├── crisis.service.ts             # ML crisis classifier
│   │   ├── plan.service.ts               # Goal → structured action plan generation
│   │   ├── summarisation.service.ts      # Session summary generation
│   │   └── prompts/
│   │       ├── coaching.prompt.ts        # Psychological pressure coaching prompt
│   │       ├── plan.prompt.ts            # Action plan generation prompt
│   │       ├── crisis.prompt.ts
│   │       └── summarisation.prompt.ts
│   │
│   ├── data/                             # Layer 3: Data (PostgreSQL + Redis)
│   │   ├── data.module.ts
│   │   ├── session-cache.service.ts      # Redis sliding window
│   │   ├── session-boundary.service.ts   # Session expiry + summary trigger
│   │   └── entities/
│   │       ├── user.entity.ts
│   │       ├── psychological-profile.entity.ts
│   │       ├── subscription.entity.ts
│   │       ├── goal.entity.ts
│   │       ├── daily-task.entity.ts
│   │       ├── proof.entity.ts
│   │       ├── strike.entity.ts
│   │       ├── execution-score.entity.ts
│   │       ├── conversation-session.entity.ts
│   │       ├── message.entity.ts
│   │       ├── crisis-alert.entity.ts
│   │       └── session-summary.entity.ts
│   │
│   ├── accountability/                   # Layer 4: Accountability Engine
│   │   ├── accountability.module.ts
│   │   ├── checkin.service.ts            # Daily check-in scheduling + delivery
│   │   ├── proof.service.ts              # Proof validation + score update
│   │   ├── strike.service.ts             # Strike logging + escalation logic
│   │   ├── score.service.ts              # Execution score calculation
│   │   ├── antighost.service.ts          # Anti-ghosting escalation flow
│   │   ├── plan-adjustment.service.ts    # Difficulty up/down based on score
│   │   └── checkin.processor.ts          # BullMQ: scheduled check-in queue worker
│   │
│   ├── onboarding/                       # Orchestration: form → Stripe → SMS → plan
│   │   ├── onboarding.module.ts
│   │   ├── onboarding.controller.ts      # POST /onboarding/submit
│   │   ├── onboarding.service.ts
│   │   ├── stripe.service.ts
│   │   ├── stripe-webhook.controller.ts  # POST /webhooks/stripe
│   │   └── dto/
│   │       └── onboarding-form.dto.ts
│   │
│   └── safety/                           # Orchestration: crisis detection + handoff
│       ├── safety.module.ts
│       ├── safety.service.ts
│       └── safety.processor.ts
│
├── tests/
│   ├── contract/
│   │   ├── twilio.contract.spec.ts
│   │   ├── claude.contract.spec.ts
│   │   ├── stripe.contract.spec.ts
│   │   └── postgres.contract.spec.ts
│   ├── integration/
│   │   ├── onboarding.integration.spec.ts
│   │   ├── checkin.integration.spec.ts
│   │   ├── proof.integration.spec.ts
│   │   ├── antighost.integration.spec.ts
│   │   ├── strike-score.integration.spec.ts
│   │   └── crisis-detection.integration.spec.ts
│   └── unit/
│       ├── coaching.service.spec.ts
│       ├── score.service.spec.ts
│       ├── antighost.service.spec.ts
│       └── crisis.service.spec.ts

frontend/
├── src/
│   ├── app/
│   │   ├── page.tsx                      # Landing page
│   │   ├── onboarding/
│   │   │   └── page.tsx                  # Multi-step onboarding form
│   │   └── layout.tsx
│   ├── components/
│   │   └── OnboardingForm/
│   │       ├── Step1Goal.tsx             # Goal description + timeline
│   │       ├── Step2PsychIntake.tsx      # Psychological intake questions
│   │       ├── Step3Contact.tsx          # Name + phone number
│   │       └── Step4Payment.tsx          # Stripe Payment Element
│   └── lib/
│       ├── stripe.ts
│       └── api.ts
```

---

## Complexity Tracking

> No constitution violations requiring justification.

*All complexity is justified by spec requirements. Accountability module is new vs Ryke but required by the core product — not speculative.*

---

## Key Design Decisions

### D0: Accountability Module as a First-Class Layer

Kiba's core differentiation — strikes, execution score, anti-ghosting, proof validation, plan difficulty adjustment — is complex enough to warrant its own module rather than embedding in the messaging or AI layers. The `AccountabilityModule` orchestrates all of this and is the only module allowed to write to `Strike`, `ExecutionScore`, `DailyTask`, and `Proof` entities. No other module writes to these tables.

### D1: BullMQ for All Async Processing + Scheduled Check-ins

All Twilio webhook responses return within 100ms. Claude API calls, crisis classification, proof processing, and Stripe events are processed via BullMQ queues backed by Redis. Daily check-ins are scheduled as delayed BullMQ jobs at onboarding time — when the user sets their preferred check-in time, a repeating delayed job is queued. This avoids a cron process and keeps scheduling inside the existing queue infrastructure.

### D2: Psychological Profile as a Separate Entity

The psychological intake data (fears, comparison figure, public failure scenario, avoidance patterns, pressure preference) is stored in a `PsychologicalProfile` entity linked to the user. It is loaded on every AI prompt construction and injected into the coaching prompt via a `buildPressureContext()` function. This ensures the data is always available and consistently applied — never reconstructed from raw conversation history.

### D3: Execution Score Calculation

The Execution Score is recalculated after every check-in event (completion, miss, proof submission). The formula weights:
- **Task completion rate** (40%) — completed / total tasks in the last 14 days
- **Proof submission rate** (30%) — proofs submitted / completions claimed
- **Response time score** (20%) — average time to respond to check-in prompts (faster = higher)
- **Streak bonus** (10%) — consecutive days with at least one completion

Score is stored as a daily snapshot in `ExecutionScore` for longitudinal tracking. This enables KIBA to reference score trends ("you were at 72 last week, you're at 48 today") not just the current value.

### D4: Anti-Ghosting as a State Machine

The anti-ghosting flow is modelled as a state machine with four states: `ACTIVE` → `GHOST_WINDOW_1` (2h no response) → `GHOST_WINDOW_2` (24h) → `GHOST_WINDOW_3` (48h, recovery required). Each state transition triggers a BullMQ delayed job for the next escalation. A user response at any point resets to `ACTIVE`. This prevents duplicate escalations on retry and makes state transitions explicit and auditable.

### D5: Claude Haiku as Default with Sonnet Override

`claude-haiku-4-5` is the default for all operations (coaching, plan generation, proof processing, crisis classification, summarisation). Overridable to `claude-sonnet-4-6` via `AI_MODEL` env var without code changes. Keeps per-turn cost near-zero while allowing quality upgrades for premium tiers in Phase 2.

### D6: Stripe SetupIntent for Free Trial

Free trial requires saving a payment method without charging upfront. SetupIntent is the correct primitive — PaymentIntent would initiate a charge. Subscription with `trial_period_days: 30` handles the trial lifecycle, automatic renewal, and webhook events (`trial_will_end`, `customer.subscription.updated`, `invoice.payment_failed`).

### D7: Session Summary Written on Expiry

When the Redis session TTL expires (4h inactivity), a Claude-generated summary (100–200 words) is written to `session_summaries` in PostgreSQL. The next session loads this as a system prompt addition. Users never lose coaching continuity. Critically, the psychological profile is always injected fresh from the database — never from the session summary — ensuring it cannot be diluted or forgotten over time.

### D8: Proof Photo Processing via Claude Vision

MMS proof photos are processed by Claude Vision. The prompt describes the user's task (e.g. "gym workout", "meal prep") and asks the model to confirm whether the image plausibly constitutes proof of that task. This is deliberately lenient — the goal is to prevent obviously irrelevant submissions, not to be a strict verifier. False negatives (accepting invalid proof) are preferred over false positives (rejecting valid effort) at MVP scale.

---

## Data Model Summary

### New Entities (Kiba-specific, not in Ryke)

**PsychologicalProfile**
```
id, user_id, fears, avoidance_patterns, comparison_figure,
public_failure_scenario, typical_failure_moment,
pressure_preference (ENUM: pressure | encouragement),
created_at, updated_at
```

**Goal**
```
id, user_id, description, timeline, current_status,
action_plan (JSONB: {milestones[], weekly_breakdown[], daily_tasks[]}),
difficulty_level (1–5), created_at, updated_at
```

**DailyTask**
```
id, goal_id, user_id, task_description, scheduled_date,
status (ENUM: pending | completed | missed | recovery),
proof_id (nullable), completion_timestamp, created_at
```

**Proof**
```
id, task_id, user_id, proof_type (ENUM: photo | text),
media_url (nullable), content (nullable), validation_status,
validated_at, created_at
```

**Strike**
```
id, user_id, daily_task_id, escalation_level (1 | 2 | 3),
created_at
```

**ExecutionScore**
```
id, user_id, current_score (0–100), completion_rate,
proof_rate, response_time_score, streak_bonus,
snapshot_date, created_at
```

**AntiGhostState** (stored in Redis + PostgreSQL for durability)
```
user_id, state (ENUM: active | ghost_1 | ghost_2 | ghost_3),
last_response_at, next_escalation_at, current_job_id
```

### Modified Entities

**User** — adds: `checkin_time` (TIME), `timezone`, `onboarding_complete` (BOOLEAN)
**Message** — adds: `is_checkin_prompt` (BOOLEAN), `is_proof_submission` (BOOLEAN)

---

## API Contracts Summary

### New Endpoints (Kiba-specific)

| Method | Path | Purpose |
|--------|------|---------|
| POST | /v1/onboarding/submit | Full onboarding form submission |
| GET | /v1/onboarding/check-phone | Phone availability check |
| POST | /v1/webhooks/sms | Twilio inbound SMS/MMS |
| POST | /v1/webhooks/imessage | SendBlue inbound iMessage |
| POST | /v1/webhooks/stripe | Stripe billing events |
| GET | /v1/admin/users | Admin: list users with scores/strikes |
| GET | /v1/admin/users/:id | Admin: user detail with full history |
| PATCH | /v1/admin/users/:id/status | Admin: suspend / reactivate user |
| GET | /v1/admin/crisis | Admin: open crisis alerts |
| POST | /v1/admin/crisis/:id/resolve | Admin: resolve crisis alert |
| GET | /v1/admin/settings | Admin: get coach contact settings |
| PATCH | /v1/admin/settings | Admin: update coach contact settings |
| DELETE | /v1/admin/users/:id/data | Admin: GDPR data deletion |

---

## Build Sequence

### Phase 0 — Foundation (Days 1–3)
1. Database schema + TypeORM migrations for all entities
2. Redis connection + BullMQ queue setup
3. Environment validation (Joi schema covering all required vars)
4. Health check endpoint (`GET /v1/health`)

### Phase 1 — Onboarding & Plan Generation (Days 4–8)
5. Onboarding DTO + form validation
6. Stripe SetupIntent + Subscription service
7. Psychological profile persistence
8. Goal entity + AI plan generation (PlanService + plan.prompt.ts)
9. Welcome SMS + plan delivery flow
10. Stripe webhook handler (subscription lifecycle)

### Phase 2 — Daily Check-in Loop (Days 9–14)
11. DailyTask scheduling via BullMQ delayed jobs
12. Check-in prompt delivery (CheckinService)
13. Inbound message routing (coaching vs proof vs checkin response)
14. Proof submission handling (photo MMS + text confirmation)
15. Claude Vision proof validation (VisionService)
16. Execution score calculation and update (ScoreService)

### Phase 3 — Accountability Engine (Days 15–20)
17. Strike logging (StrikeService)
18. Anti-ghosting state machine (AntiGhostService + BullMQ delayed jobs)
19. Escalation message generation with psychological profile injection
20. Plan difficulty adjustment (PlanAdjustmentService)
21. Execution score referencing in all coaching prompts

### Phase 4 — AI Coaching with Pressure (Days 21–24)
22. Psychological pressure coaching prompt (coaching.prompt.ts)
23. Profile context builder (buildPressureContext())
24. Session cache + session boundary + session summary
25. Context-aware coaching responses with strike/score awareness

### Phase 5 — Safety & Admin (Days 25–28)
26. Crisis detection (ML hybrid: Claude + BERT)
27. Holding message + pressure suspension
28. Coach alert (SMS + email via SMTP)
29. Admin panel: users, crisis alerts, settings

### Phase 6 — iMessage + Frontend Polish (Days 29–32)
30. SendBlue iMessage integration (outbound + inbound webhook)
31. Channel-agnostic MessagingService
32. Frontend: onboarding form steps (goal, psych intake, contact, payment)
33. Frontend: landing page Kiba branding complete

### Phase 7 — Testing & Deploy (Days 33–36)
34. Contract tests: Twilio, Claude, Stripe, PostgreSQL
35. Integration tests: onboarding, checkin, proof, antighost, crisis
36. CI pipeline verification
37. Render deploy + env var validation
38. End-to-end smoke test: onboarding → plan → check-in → proof → strike → antighost

---

## ADR Flags

- 📋 **Accountability module as separate layer** — new architectural pattern vs Ryke. Document decision to extract strikes/score/antighost vs embedding in messaging. Run `/sp.adr accountability-module-design`
- 📋 **Anti-ghosting state machine design** — BullMQ delayed jobs vs cron vs in-process timer. Run `/sp.adr antighost-state-machine`
- 📋 **Execution score formula** — weighting of completion rate, proof rate, response time, streak. Run `/sp.adr execution-score-formula`
- 📋 **Psychological profile injection strategy** — always-fresh DB load vs session cache. Run `/sp.adr psychological-profile-injection`
