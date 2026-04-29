<!--
SYNC IMPACT REPORT
==================
Version change: 1.1.0 → 1.2.0  (MINOR — 3 new principles, finalized tech stack, AI behavior
                                  constraints, engineering principles, development timeline)
Modified principles:
  - IX. Human-like & Action-Oriented AI — expanded with strict AI behavior constraints
  - VIII. YAGNI & MVP-First — expanded with 4–8 week timeline constraint
Added principles:
  - XII. API-First & Strict Separation of Concerns
  - XIII. Webhook-Driven & Stateless Messaging
  - XIV. Zero-Friction Onboarding
Added sections:
  - Engineering Principles (as subsection of Development Workflow)
  - AI Behavior Constraints (as subsection of principle IX)
  - Out of Scope Enforced list updated (mobile apps, multi-channel)
Modified sections:
  - Confirmed Tech Stack — finalized (Node.js/TypeScript, NestJS/Express, Redis added,
    Vercel + AWS split, Docker preferred)
  - Phase 1 MVP Scope Boundary — out-of-scope expanded
Removed TODOs:
  - TODO(TECH_STACK_BACKEND) resolved — Node.js (TypeScript) confirmed
Remaining TODOs:
  - TODO(RATIFICATION_OWNER): Confirm ratifying authority
Templates requiring updates:
  ✅ .specify/templates/plan-template.md  — new gates + engineering principles
  ✅ .specify/templates/spec-template.md  — zero-friction onboarding + AI behavior
  ✅ .specify/templates/tasks-template.md — separation of concerns reflected in task layers
==================
-->

# RYKE AI Constitution

## Vision

RYKE AI is an SMS-first AI coaching platform that delivers fitness, nutrition, and mental wellness
guidance through real-time text conversations. It serves two audiences: end users seeking
affordable, always-available coaching, and coaches who want to automate and scale client
engagement — all without a mobile app.

## Phase 1 MVP Scope Boundary

### In Scope (MVP — Phase 1 only)

- User sign-up via Next.js landing page (phone number capture)
- Welcome SMS sent automatically on registration via Twilio
- SMS-based AI coaching conversations (fitness, nutrition, mental wellness)
- Conversational context maintained per user session (PostgreSQL + optional Redis)
- Human-like, action-oriented, single-question-at-a-time AI responses
- Basic user data and conversation history storage

### Out of Scope (Enforced — MUST NOT be built in Phase 1)

- Native mobile apps (iOS, Android)
- Wearable device integrations (Apple Watch, Fitbit, WHOOP, Oura, etc.)
- Advanced coach dashboard and visual analytics
- Voice/style personalisation model training
- Calorie estimation from photos (MMS vision)
- Human handoff alert dashboard (Phase 2)
- Response delay configuration UI (Phase 2)
- Smart scheduling engine (Phase 2)
- Mental health crisis escalation pipeline (Phase 2)
- Multi-channel support (WhatsApp, email, push notifications)
- Complex analytics or reporting

> **Rule**: Any task or PR that references out-of-scope items MUST be blocked and deferred to the
> Phase 2 backlog. Architecture MUST remain simple and modular so Phase 2 can layer on top without
> rewrites.

## Confirmed Tech Stack

| Layer | Technology | Decision |
|---|---|---|
| Backend Language | Node.js — TypeScript | Confirmed |
| Backend Framework | Express or NestJS | NestJS preferred for modularity; Express if team speed is priority |
| AI Engine | OpenAI GPT-4o / Claude API | Prompt-controlled conversational engine |
| Messaging | Twilio SMS API | Inbound/outbound via webhooks |
| Database | PostgreSQL | Users, sessions, message history |
| Cache | Redis | Conversation state, quick retrieval (optional for MVP, recommended) |
| Frontend | Next.js | Landing page + onboarding only |
| Frontend Hosting | Vercel | Static/SSR Next.js deployment |
| Backend Hosting | AWS (EC2 / Lambda + RDS) | Scalable backend services |
| Containerization | Docker | Preferred for MVP; not mandatory if it slows delivery |

**Backend → Messaging → AI → DB** are strict layers; no cross-layer direct calls allowed.

## Core Principles

### I. SMS-First, No-App Interface (NON-NEGOTIABLE)

All user-facing coaching interactions MUST be delivered exclusively over SMS.
No native mobile app and no web portal for the coaching experience in Phase 1.

- Every coaching feature MUST be expressible as a text exchange.
- System responses MUST be concise enough to read in a single SMS thread.
- Onboarding, reminders, check-ins, and health guidance MUST function without
  any app installation on the user's device.
- The Next.js landing page is for sign-up only; it MUST NOT replicate the
  coaching experience.
- Multi-channel support (WhatsApp, email) is OUT OF SCOPE for Phase 1.

### II. AI Personalization — Voice & Style Adaptation

The AI MUST adapt to each user's communication style, tone, and wellness preferences
using their conversation history as context.

- Responses MUST reflect the user's preferred language register (casual, formal, motivational).
- Personalization data MUST be scoped per user and MUST NOT bleed across accounts.
- Users MUST be able to reset or review their personalization context on request.
- **Phase 1**: Personalization via rolling conversation history window only.
  Deep voice-model training is a Phase 2 feature.

### III. Safety-First & Human Handoff (NON-NEGOTIABLE)

Automated AI responses MUST never replace human judgment in crisis or
high-risk mental health situations.

- System MUST detect predefined risk signals (distress keywords, crisis language,
  repeated negative sentiment) and trigger an immediate alert.
- Coach MUST be notified within a configurable SLA (default: 5 minutes) of a
  risk signal being detected.
- System MUST send a supportive holding message to the user while awaiting response.
- Human handoff logic MUST be present in every deployment and MUST NOT be
  disabled by configuration.
- **Phase 1**: Basic crisis keyword detection with coach email/SMS alert only.
  Full handoff dashboard is Phase 2.

### IV. Vision-Powered Nutrition Analysis

System MUST support calorie and macro-nutrient estimation from user-submitted
food photos sent via MMS.

- **Phase 1**: OUT OF SCOPE. Deferred to Phase 2.

### V. Coach Observability & Analytics

All user interactions, health events, and AI decisions MUST be observable.

- System MUST emit structured logs for every inbound message, AI response,
  scheduled action, and handoff event.
- **Phase 1**: Structured logging only. Visual dashboard is Phase 2.

### VI. Privacy & Health Data Security (NON-NEGOTIABLE)

All personal and health data MUST be protected to HIPAA-adjacent standards.

- All data MUST be encrypted in transit (TLS 1.2+) and at rest (AES-256 or equivalent).
- Health data MUST never be sold, shared with third parties, or used for training
  without explicit, auditable user consent.
- Users MUST be able to request full data export or deletion at any time.
- Secrets and credentials MUST be managed via environment variables or a secrets
  manager; MUST NOT be hardcoded or committed to source control.

### VII. Extensible Architecture — Wearables-Ready

Data models and service interfaces MUST be designed to support future wearable
integrations without breaking schema changes.

- Health metric entities MUST use source-agnostic schemas (no device-specific fields
  at the top level).
- Integration adapter interfaces MUST be defined even if not implemented in Phase 1.
- **Phase 1**: Schema design + adapter interfaces only. No active wearable connections.

### VIII. YAGNI & MVP-First Delivery (NON-NEGOTIABLE)

The smallest working system that delivers user value MUST always be preferred.
The Phase 1 MVP MUST be buildable and shippable within **4–8 weeks**.

- Features outside Phase 1 scope MUST NOT be built, even if easy to add.
- No microservices unless clearly necessary — a modular monolith is the default.
- No premature integrations (wearables, dashboards, scheduling engine = Phase 2).
- Over-engineering, premature abstraction, and speculative generality are
  constitution violations.
- Every PR MUST justify its scope against the 4–8 week MVP delivery constraint.

### IX. Human-like & Action-Oriented AI

Every AI response MUST sound natural, conversational, and include one concrete
actionable next step. AI MUST feel like a real coach, not a chatbot.

**Response behavior (strict):**
- MUST be short: typically 1–4 sentences, always SMS-appropriate length.
- MUST be context-aware: reference what the user said, not a generic template.
- MUST be human-like: no bullet lists, no robotic phrasing, no clinical language.
- MUST ask only ONE question per response — never overwhelm with multiple asks.
- MUST end with a clear next step (a plan, a reminder, a specific action).
- Tone MUST adapt to emotional state: encouraging when struggling, energetic when
  motivated, calm and grounding during stress signals.

**Prohibited patterns:**
- Generic responses that ignore user context.
- Bullet-point style answers in conversational turns.
- Responses that ask two or more questions at once.
- Responses without an actionable element.

### X. Test-First Quality — Predefined Test Cases

Tests MUST be written and approved before implementation begins.
No feature ships without passing its predefined test cases.

- Every user story MUST have Given/When/Then acceptance scenarios before any code.
- Red-Green-Refactor cycle is mandatory.
- Contract tests MUST exist for every external integration (Twilio, AI API, PostgreSQL).
- Integration tests MUST cover: inbound SMS → AI processing → outbound SMS.
- A feature is NOT done until all predefined tests pass in CI.

### XI. Token-Efficient AI

AI prompts MUST be optimized to minimize token consumption without sacrificing quality.

- System prompts MUST be concise and role-scoped.
- Conversation history passed to the AI MUST use a sliding window or summary
  compression — minimum context needed for coherent replies only.
- Redundant instructions MUST NOT be repeated on every turn; use system-level context.
- Token usage per turn MUST be logged; spikes trigger a prompt-engineering review.
- Prompt templates MUST be reviewed for token cost before deployment.

### XII. API-First & Strict Separation of Concerns

All services MUST be modular, reusable, and communicate via defined API contracts.
No layer MUST directly call another layer's internals.

**Three mandatory layers — no cross-layer shortcuts:**

1. **Messaging Layer** — Handles all Twilio inbound/outbound communication.
   Responsible for: receiving webhooks, sending SMS, message queuing.
   MUST NOT contain business logic or AI calls.

2. **AI Processing Layer** — Handles all AI provider interactions.
   Responsible for: prompt construction, context management, response parsing.
   MUST NOT call Twilio directly or write to the database.

3. **Data Layer** — Handles all persistence (PostgreSQL, Redis).
   Responsible for: user records, conversation history, session state.
   MUST NOT contain messaging or AI logic.

- All inter-layer communication MUST go through service interfaces or internal APIs.
- New features MUST be addable to one layer without modifying the others.

### XIII. Webhook-Driven & Stateless Messaging

The messaging system MUST be event-driven via Twilio webhooks. Services MUST be
stateless; conversation state MUST be persisted externally.

- Inbound SMS MUST trigger a webhook that the backend processes asynchronously.
- Services MUST NOT hold conversation state in memory between requests.
- All conversation state MUST be stored in PostgreSQL or Redis.
- Webhook endpoints MUST validate Twilio signatures before processing.
- Failed webhook processing MUST be retried with exponential back-off.
- Outbound SMS MUST be queued and sent via the Messaging Layer only.

### XIV. Zero-Friction Onboarding (NON-NEGOTIABLE)

From phone number entry to first AI response MUST require zero extra steps for the user.

- User submits phone number on the landing page → welcome SMS arrives within 30 seconds.
- No email confirmation, no password, no app download, no additional form fields required.
- The welcome SMS MUST immediately invite the user to start a conversation.
- Onboarding flow MUST be completable on any phone — smartphone or basic SMS-capable device.
- Any friction introduced in onboarding MUST be justified and reviewed against this principle.

## Delivery & Operational Constraints

- **Timeline**: Phase 1 MVP MUST ship within 4–8 weeks of development start.
- **Availability**: SMS delivery SLA default target is 99.5% uptime for message processing.
- **Scale**: Architecture MUST support horizontal scaling of message workers without code changes.
- **Cost tracking**: Per-message AI token cost and Twilio SMS cost MUST be logged and operator-visible.
- **Response delay**: Configurable per-user AI response delay windows are a Phase 2 feature.

## Development Workflow & Quality Gates

All features MUST pass these gates before merge:

1. **SMS-First Gate** — Every coaching output must be deliverable as SMS. Flag any feature
   requiring a browser/app (landing page sign-up is the sole exception).
2. **Safety Gate** — Mental health or distress features MUST include handoff logic +
   integration test exercising the handoff path.
3. **Privacy Gate** — Features handling health/personal data MUST include encryption,
   access control, and consent mechanism.
4. **Extensibility Gate** — New health metric entities MUST use source-agnostic schema.
5. **Observability Gate** — Every new service operation MUST emit a structured log event.
6. **MVP Scope Gate** — Phase 2+ features MUST be blocked and deferred to backlog.
7. **Test-First Gate** — PRs MUST include predefined test files. No test = no merge.
8. **Token-Efficiency Gate** — New AI prompt templates MUST include estimated token count.
   Prompts exceeding 500 tokens/turn MUST be reviewed and justified.
9. **Separation of Concerns Gate** — No cross-layer direct calls. Messaging/AI/Data layers
   MUST remain independently deployable and testable.
10. **Zero-Friction Gate** — Any onboarding change MUST be tested end-to-end: phone number
    entry → welcome SMS received in under 30 seconds.

## Governance

- This constitution supersedes all other practices, style guides, and ad-hoc decisions.
- NON-NEGOTIABLE principles (I, III, VI, VIII, XIV) MUST NOT be disabled by any feature
  flag, configuration, or deployment option.
- Amendments require: written rationale, version increment per semver rules, migration plan
  for affected specs/tasks, and explicit lead architect approval.
- All PRs MUST include a Constitution Check section confirming gate compliance.
- Complexity beyond the smallest viable change MUST be justified in the plan's
  Complexity Tracking table.
- TODO(RATIFICATION_OWNER): Confirm ratifying authority (Sophia Renard / lead architect)
  before v1.2.0 is considered formally ratified.

**Version**: 1.2.0 | **Ratified**: 2026-04-28 | **Last Amended**: 2026-04-28
