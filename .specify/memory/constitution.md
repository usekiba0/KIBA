# KIBA Constitution

**Version**: 1.0.0 | **Created**: 2026-05-09

---

## Vision

KIBA is an SMS-first psychological accountability system that makes ignoring your goals impossible. It is not a productivity tool, a habit tracker, or a chatbot. KIBA operates on a core truth: users fail due to ego protection, not lack of knowledge. When friction hits, people avoid exposure rather than execute. KIBA removes the ability to silently fail.

KIBA combines deep psychological profiling, pressure-based messaging, proof submission, and consequence systems to force execution through structured accountability loops.

## Positioning (NON-NEGOTIABLE)

- **NOT**: AI productivity tool
- **NOT**: Habit tracker
- **NOT**: Motivational chatbot
- **YES**: A system that makes ignoring goals impossible

All product, copy, and feature decisions MUST align with this positioning.

## Phase 1 MVP Scope

### In Scope

- Psychological onboarding (deep intake: fears, comparisons, failure patterns, pressure preference)
- Goal creation with timeline and current status
- AI-generated structured action plan (milestones, weekly breakdown, daily tasks)
- Daily check-in system (AI prompts daily, user confirms task completion)
- Proof submission via SMS/MMS (photo, text confirmation)
- Strike tracking (missed tasks logged, ego-based pressure escalation)
- Execution score (0–100 performance metric)
- Anti-ghosting system (user must acknowledge miss or reset — no silent failure)
- Dynamic tone system (adapts delivery style, maintains pressure regardless)
- Crisis detection and coach alert (safety net for distress signals)
- Web onboarding form (goal, timeline, psychological intake, payment)
- Stripe subscription with 30-day free trial

### Out of Scope (Phase 1)

- Money Mode (financial stakes / commitment contracts)
- 1v1 Challenge Mode (social competition)
- Social Proof Cards (shareable wins)
- Gamification badges and levels
- Voice-based interaction
- Wearable integrations
- Native mobile apps
- Coach dashboard with visual analytics
- Multi-channel support (WhatsApp, email push)

## Core Principles

### I. Pressure Over Motivation (NON-NEGOTIABLE)

KIBA operates on pressure, not encouragement. Every system decision MUST prioritize accountability over comfort.

- AI responses MUST reference the user's own stated fears, comparisons, and failure patterns.
- Generic motivational messages are PROHIBITED.
- Pressure MUST be maintained consistently — not just when users fail.
- Tone adapts (casual vs professional) but intensity does NOT soften without cause.

### II. No Silent Failure (NON-NEGOTIABLE)

Users MUST NOT be able to disappear. Every missed task MUST trigger a response.

- Missed check-in → immediate follow-up message within a configurable window.
- User MUST acknowledge the miss or accept a recovery task before resuming normal flow.
- Anti-ghost recovery MUST assign a replacement task instantly.
- Strikes MUST be logged and referenced in future messages.

### III. Psychological Personalization

KIBA MUST use onboarding intake data to inject emotional triggers into every accountability message.

- Onboarding MUST capture: what the user hates about their current situation, what they are avoiding, who they compare themselves to, what would embarrass them publicly if they failed, when they typically fail, and whether they prefer pressure or encouragement.
- AI MUST reference this data throughout the coaching lifecycle — not just at onboarding.
- Messages MUST feel personal and unavoidable, not templated.

**Example:**
- Generic: "Did you go to the gym?"
- KIBA: "You said you're tired of being behind your friends. Skipping today is exactly how that happens. Send proof now."

### IV. Proof-Based Accountability

Claims without evidence are not accepted. KIBA demands proof, not promises.

- Users MUST submit proof of task completion (photo, timestamp, or specific confirmation).
- AI MUST prompt for proof on high-commitment tasks.
- Proof submission MUST be tracked per task and factored into the Execution Score.
- Phase 1 proof = photo MMS or explicit text confirmation. Advanced verification (integrations) = Phase 2.

### V. Execution Score System

Every user has a 0–100 Execution Score visible to them at all times.

- Score tracks: task completion rate, response time to check-ins, proof submission rate, consistency streaks.
- Score MUST be referenced in AI messages to gamify accountability seriously.
- High performers receive escalating challenges; low performers receive increased pressure.
- Score resets are allowed but MUST be logged and referenced.

### VI. Adaptive Difficulty

KIBA MUST adjust plan difficulty based on user behavior — not user request.

- Miss 2–3 days → reduce task difficulty automatically.
- Consistent completion → increase challenge.
- Inactive for 48+ hours → escalate pressure and trigger anti-ghost recovery.
- Users MUST NOT be able to manually reduce their own difficulty without a streak reset.

### VII. Safety-First & Crisis Handling (NON-NEGOTIABLE)

Pressure MUST never escalate into genuine harm. Crisis detection is mandatory in every deployment.

- System MUST detect distress signals (crisis language, repeated negative sentiment, explicit distress keywords).
- Coach MUST be alerted within 5 minutes via SMS and email.
- User MUST receive a supportive holding message immediately when crisis is detected.
- AI pressure tone MUST be suspended during an active crisis flag.
- Crisis detection MUST NOT be disabled by configuration or feature flag.

### VIII. SMS-First Interface (NON-NEGOTIABLE)

All user-facing accountability interactions MUST be delivered over SMS.

- Every feature MUST be expressible as a text exchange.
- No native mobile app in Phase 1.
- The Next.js web app is for onboarding and dashboard only.
- Coaching and accountability flow over SMS exclusively.

### IX. AI Behavior — Sharp, Direct, Human

Every AI response MUST sound like a trusted but uncompromising accountability partner.

**Required:**
- Short: 1–4 sentences, SMS-appropriate length.
- Context-aware: reference the user's own words, goals, and history.
- Direct: no hedging, no over-qualification, no motivational filler.
- Action-demanding: every message ends with a specific required action or confirmation.
- At most ONE question per response.

**Prohibited:**
- Generic encouragement without context.
- Bullet-point style responses.
- Responses that allow the user to disengage without consequence.
- Multiple questions in one message.

### X. Privacy & Data Security (NON-NEGOTIABLE)

Psychological intake data is sensitive. It MUST be protected at the highest level.

- All data encrypted in transit (TLS 1.2+) and at rest (AES-256).
- Psychological intake data MUST never be sold or shared with third parties.
- Users MUST be able to request full data export or deletion at any time.
- Secrets and credentials MUST use environment variables only — never hardcoded.

### XI. MVP-First Delivery (NON-NEGOTIABLE)

The smallest working system that delivers accountability value ships first.

- Phase 2 features (Money Mode, Challenge Mode, Social Cards) MUST NOT be built in Phase 1.
- No microservices unless clearly necessary.
- Over-engineering and premature abstraction are constitution violations.
- Every PR MUST justify scope against MVP delivery.

### XII. Separation of Concerns

Three mandatory layers — no cross-layer shortcuts:

1. **Messaging Layer** — Twilio inbound/outbound. No business logic or AI calls.
2. **AI Processing Layer** — Prompt construction, context, response. No direct DB writes or Twilio calls.
3. **Data Layer** — PostgreSQL + Redis persistence. No messaging or AI logic.

### XIII. Token-Efficient AI

Prompts MUST be optimized. Psychological context is injected surgically, not dumped wholesale.

- System prompts MUST be concise and role-scoped.
- Conversation history uses sliding window or summary compression.
- Token usage MUST be logged per turn; spikes trigger prompt review.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js / TypeScript / NestJS |
| AI Engine | Anthropic Claude API |
| Messaging | Twilio SMS + SendBlue iMessage |
| Database | PostgreSQL |
| Cache / Queue | Redis (Upstash) |
| Frontend | Next.js |
| Frontend Hosting | Vercel |
| Backend Hosting | Render |

## Delivery & Quality Gates

All features MUST pass these gates before merge:

1. **Pressure Gate** — Does this feature eliminate a silent failure path or increase accountability?
2. **Personalization Gate** — Does this feature use psychological intake data?
3. **No-Ghost Gate** — Does this feature allow users to disappear without consequence? If yes, block it.
4. **Safety Gate** — Any distress/crisis path MUST include handoff logic and integration test.
5. **Privacy Gate** — Psychological data features MUST include encryption and consent mechanism.
6. **SMS-First Gate** — Every accountability output deliverable over SMS.
7. **Test-First Gate** — No feature ships without predefined test cases passing in CI.
8. **MVP Scope Gate** — Phase 2 features blocked and deferred.
9. **Token-Efficiency Gate** — New AI prompts include estimated token count.
10. **Separation of Concerns Gate** — No cross-layer direct calls.

## Governance

- This constitution supersedes all other practices and ad-hoc decisions.
- NON-NEGOTIABLE principles MUST NOT be disabled by feature flag or configuration.
- Amendments require written rationale, version increment, and lead architect approval.
