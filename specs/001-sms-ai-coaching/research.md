# Research: RYKE AI MVP Phase 1 — SMS-First AI Coaching

**Branch**: `001-sms-ai-coaching` | **Date**: 2026-04-29 | **Phase**: 0

---

## 1. ML-Based Crisis Detection

### Decision
**Hybrid approach: Claude API (primary classifier) + Transformers.js local BERT (fast-path & fallback)**

### Rationale
- Claude API catches subtle distress patterns (hopelessness language, repeated negative sentiment) that keyword lists and lightweight models miss
- Local BERT (`Amalq/mental-health-roberta-large` via Transformers.js) provides zero-cost, ~80ms fast-path for high-signal keywords and serves as fallback when Claude API is unavailable
- Async BullMQ queue means user receives an immediate response — classification adds 0ms to perceived latency
- Total cost: ~$0.21 per 1,000 messages classified (hybrid) vs $0.25 (Claude only) vs $0 (BERT only)

### Confidence Threshold
- **≥ 0.80**: Auto-escalate — holding message sent, coach alerted
- **0.50–0.79**: Flag for human review (queue for coach, AI continues with empathetic tone)
- **< 0.50**: Log for monitoring only
- Target false-negative rate: < 5% (requires threshold tuned to ~0.65 for balanced detection)

### Integration Pattern
```
SMS received → store + respond to Twilio immediately (< 100ms)
  → BullMQ: process-coaching-message (async)
      → Keyword pre-filter (5ms)
      → If high-risk keywords → Local BERT (80ms)
      → Else → Claude API with prompt caching (200–400ms cached, 800–1200ms cold)
      → Confidence routing → store result + trigger actions
```

### Alternatives Considered
- **OpenAI Moderation API**: Rejected — 523 false negatives in benchmark; only catches explicit self-harm, not subtle distress
- **HuggingFace Inference API only**: Rejected — cold starts (3–5s) too slow for crisis path; use as BERT download source, not live inference
- **Verily VBHSF**: Not publicly available; proprietary research system

### Evaluation Dataset
- Primary: Verily Mental Health Crisis Dataset v1.0 (1,800 clinician-labelled messages, 8 crisis dimensions)
- Secondary: MentalChat16K (`ShenLab/MentalChat16K`) for cross-domain validation
- Custom: 200+ labelled SMS samples from internal test set before launch

---

## 2. Payment Processing — Stripe + Free Trial

### Decision
**Stripe SetupIntent → Subscription with `trial_period_days: 30`**

### Rationale
- SetupIntent is purpose-built for saving payment methods without immediate charge — correct primitive for a "no charge at signup" trial
- Payment Element (not legacy Stripe Elements) handles 40+ payment methods, native SCA/3D Secure, and trial UI with minimal frontend code
- Only `stripe_customer_id` and `stripe_subscription_id` stored in PostgreSQL — raw card data never touches RYKE AI servers

### Flow
1. Next.js form creates SetupIntent via backend (`POST /subscriptions/setup-intent`)
2. Frontend confirms with Stripe Payment Element (`confirmSetupIntent()`)
3. Backend creates Subscription with `trial_period_days: 30` → status: `trialing`
4. Welcome SMS triggered on `customer.subscription.created` webhook event

### Webhook Events to Handle

| Event | Action |
|-------|--------|
| `customer.subscription.created` | Trigger welcome SMS, create user record |
| `customer.subscription.trial_will_end` | Send 3-day reminder SMS to user |
| `customer.subscription.updated` | On `trialing → active`: send "trial ended" SMS |
| `invoice.payment_failed` | Notify user, pause coaching until resolved |
| `invoice.payment_succeeded` | Log renewal |

### Key Implementation Notes
- `rawBody: true` required in `NestFactory.create()` for webhook signature verification
- Webhook idempotency: track processed webhook IDs in DB to prevent duplicate handling
- Use `@golevelup/nestjs-stripe` package for NestJS integration

### Alternatives Considered
- **PaymentIntent**: Designed for immediate charge — wrong primitive for free trials
- **Manual charge + stored card**: More complexity, higher PCI scope — rejected in favour of Stripe's managed billing

---

## 3. MMS Photo Nutrition Analysis — Claude Vision

### Decision
**Claude claude-haiku-4-5 with image URL references + structured JSON output**

### Rationale
- Claude Haiku fully supports vision input (image URL and base64)
- URL reference (not base64) preferred — avoids downloading/re-encoding Twilio media, reduces payload size
- Structured outputs (beta) guarantee valid JSON without try/catch parsing
- Cost: ~$0.000002–$0.000004 per image (practically free at MVP scale)
- Latency: ~1.5–2.4s total (Twilio media fetch + Claude processing) — well within 15s SLA
- Phase 1 accuracy (~37% MAPE) is comparable to GPT-4V and sufficient for initial coaching guidance

### Input Format
```typescript
// Preferred: URL reference — avoids downloading media
{
  type: "image",
  source: { type: "url", url: twilioMediaUrl }
}
```

### Output Schema (Structured JSON)
```json
{
  "detected_foods": ["grilled chicken", "brown rice", "broccoli"],
  "total_calories": 520,
  "macronutrients": { "protein_grams": 48, "carbs_grams": 42, "fat_grams": 12 },
  "health_condition_flags": ["high_sodium_for_hypertension"],
  "dietary_recommendation": "Great protein source. Consider reducing rice portion by a third to stay within your calorie target."
}
```

### Note on Accuracy
All vision models have ~37–50% MAPE on calorie estimation. Users should be informed estimates are approximate. Phase 2 option: LogMeal API for specialised food detection accuracy.

### Alternatives Considered
- **GPT-4V**: Similar accuracy (~36% MAPE), 5–8x higher cost per image — rejected
- **Google Cloud Vision**: Only 9% food identification accuracy — rejected
- **LogMeal/Calorie Mama APIs**: Better food accuracy but additional vendor dependency and cost — deferred to Phase 2

---

## 4. Twilio SMS/MMS Webhook Handling in NestJS

### Decision
**NestJS Guard for signature validation + immediate empty 200 response + BullMQ async processing**

### Webhook Body Fields

**SMS:**
- `From`, `Body`, `SmsMessageSid`, `AccountSid`, `NumMedia: "0"`

**MMS (additional):**
- `NumMedia: "1"` (or more), `MediaUrl0`, `MediaContentType0`

### Signature Validation (NestJS Guard)
```typescript
const isValid = twilio.validateRequest(
  twilioAuthToken,
  request.header('X-Twilio-Signature'),
  fullUrl,           // must include query params
  request.body       // form-encoded object
);
```
- Requires `express.urlencoded({ extended: false })` in `main.ts`
- Do NOT re-encode URL after Twilio sends it

### Response Format
- Return empty body with `Content-Type: text/xml` and HTTP 200
- Never exceed Twilio's 15-second timeout — respond within 100ms, queue the rest

### Outbound SMS
- Use `client.messages.create()` via BullMQ `sms` queue with 3-attempt exponential backoff (2s base)
- All outbound SMS goes through the Messaging Layer only — no direct Twilio calls from AI or Data layers

---

## 5. Session Context Management

### Decision
**Redis sliding window (last 20 messages, 4h TTL) + Claude-summarised long-term context in PostgreSQL**

### Architecture
```
New message arrives
  → GET session:{userId} from Redis (< 1ms)
  → Cache miss? → Load last 20 messages from PostgreSQL → write back to Redis (TTL: 4h)
  → Build Claude prompt: [system prompt with user profile] + [optional summary] + [20 recent messages]
  → Claude API call
  → Append response to Redis window + write to PostgreSQL
  → Session TTL reset on every message
```

### Session Boundary
- **Session expires**: 4 hours of inactivity (Redis key TTL expires)
- **On expiry**: Claude generates a 100–200 word summary of the session and stores it in `session_summaries` table
- **On next message after expiry**: AI loads summary as context instead of raw messages; greets user warmly acknowledging the gap

### Summarisation Trigger
Summarise when ANY of:
1. Session TTL expires (4h inactivity)
2. Message count in session ≥ 30
3. Estimated token usage ≥ 75% of Claude Haiku context window (200k tokens)

### Claude Summarisation Prompt Pattern
Extract and preserve: user goals, progress made, challenges mentioned, communication style preference, explicit commitments/actions, health metrics.
Output: 100–200 word paragraph. Model: `claude-haiku-4-5` (cheap, fast for summarisation tasks).

### Sliding Window Size
- Last 20 messages (~15k–30k tokens estimated)
- Well within Claude Haiku's 200k token context window, leaving ample room for system prompt and response

### Alternatives Considered
- **Full history every message**: Rejected — token cost grows unboundedly; $X per message at 1000-message history
- **Fixed 10-message window**: Rejected — loses coaching continuity for multi-session users
- **External vector memory (Pinecone, etc.)**: Deferred to Phase 2 — adds operational complexity beyond MVP scope

---

## 6. Session Inactivity Timeout — Confirmed Value

### Decision
**4 hours (configurable via environment variable `SESSION_TIMEOUT_HOURS`)**

### Rationale
- Balances "one day = one session" feel with cost efficiency
- Users who check in morning and evening (8h gap) get a fresh session with warm context via summary
- Configurable without code change — can tune post-launch based on usage patterns
- Matches Redis key TTL exactly — no separate cleanup job needed

---

## 7. iMessage Provider — SendBlue

### Decision
**SendBlue API for iMessage delivery to iPhone users**

### Rationale
- Purpose-built REST API for iMessage/SMS business messaging — designed exactly for this use case
- Inbound webhook support for receiving user replies (same pattern as Twilio — drop-in compatible)
- Automatic SMS fallback built-in — no manual fallback logic needed in RYKE AI code
- Fast setup (API key and go) — no lengthy Apple approval process like Apple Messages for Business
- Node.js/TypeScript compatible REST API
- Twilio remains the channel for Android users, MMS, and basic feature phones

### Integration Pattern
```
MessagingService.send(userId, message)
  → Look up user.phone_type (detected on first message or from onboarding)
  → iPhone + iMessage available → SendBlue API
  → Android / fallback           → Twilio API
  → Both channels share same BullMQ send-sms queue worker
```

Inbound routing:
```
POST /webhooks/sms    ← Twilio (SMS/MMS from Android + feature phones)
POST /webhooks/imsg   ← SendBlue (iMessage replies from iPhone users)
  → Both parse to same internal InboundMessageDto
  → Same BullMQ coaching queue
  → Same session context lookup
```

### Alternatives Considered
- **Linq**: Primarily a digital networking/contact platform — iMessage is secondary, limited inbound webhook support, longer setup. Rejected.
- **Apple Messages for Business**: Requires Apple approval, complex certification, not suitable for MVP timeline. Deferred to Phase 2 consideration.

### ADR Flag
📋 iMessage provider selection — document tradeoffs? Run `/sp.adr imessage-provider-selection`

---

## 8. NestJS Module Architecture — 3-Layer Structure

### Decision
**Three NestJS feature modules enforcing constitution's mandatory layer separation**

| Module | Responsibility | External Calls |
|--------|---------------|---------------|
| `MessagingModule` | Twilio inbound/outbound, webhook validation, MMS media retrieval | Twilio API only |
| `AiModule` | Claude API calls (coaching, vision, crisis classification, summarisation) | Claude API only |
| `DataModule` | PostgreSQL entities, Redis cache, repositories | Database only |
| `OnboardingModule` | Web form submission, Stripe SetupIntent/Subscription, welcome SMS trigger | Stripe API → MessagingModule |
| `SafetyModule` | Crisis detection orchestration, alert dispatch | AiModule → MessagingModule |

Inter-module communication via NestJS service injection through exported interfaces — no direct cross-layer calls.

---

## 8. Cost Estimates (MVP Scale — 100 active users/month)

| Component | Provider | Unit Cost | Est. Volume | Monthly |
|-----------|----------|-----------|-------------|---------|
| Twilio SMS (outbound) | Twilio | $0.0075/msg | 20,000 | $150 |
| Twilio MMS (outbound) | Twilio | $0.020/msg | 2,000 | $40 |
| Claude Haiku (coaching) | Anthropic | ~$0.000001/msg | 25,000 | ~$0.03 |
| Claude Haiku (vision) | Anthropic | ~$0.000004/img | 2,000 | ~$0.008 |
| Crisis classification | Anthropic | ~$0.21/1K msgs | 25K msgs | ~$5.25 |
| Stripe processing | Stripe | 2.9% + $0.30 | 100 payments | ~$30 |
| AWS EC2 + RDS | AWS | ~$30–50/mo | — | $40 |
| Redis (ElastiCache) | AWS | ~$15/mo | — | $15 |
| **Total** | | | | **~$280/mo** |

> Twilio SMS is the dominant cost driver at MVP scale. This validates the spec decision to capture full user profile upfront (onboarding form) to minimise discovery SMS rounds.
