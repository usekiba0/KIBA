# Data Model: RYKE AI MVP Phase 1

**Branch**: `001-sms-ai-coaching` | **Date**: 2026-04-29

---

## Entity Overview

```
User ──────────────── Subscription (1:1)
 │
 ├─── ConversationSession (1:many)
 │         └── Message (1:many)
 │              └── NutritionalAnalysis (1:0..1, MMS only)
 │
 ├─── CrisisAlert (1:many)
 │
 └─── SessionSummary (1:many)
```

---

## Entities

### User

Primary identity record. Phone number is the canonical identifier — no email or password.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | UUID | PK, not null | Generated |
| `phone_number` | VARCHAR(20) | UNIQUE, not null | E.164 format: +15551234567 |
| `name` | VARCHAR(100) | not null | From onboarding form |
| `coaching_focus` | ENUM | not null | `fitness`, `nutrition`, `wellness`, `combined` |
| `goals` | TEXT | not null | Free-text from onboarding form |
| `height_cm` | SMALLINT | nullable | Body metric from form |
| `weight_kg` | DECIMAL(5,2) | nullable | Body metric from form |
| `age` | SMALLINT | nullable | Body metric from form |
| `health_conditions` | TEXT[] | default [] | e.g. ["diabetes", "hypertension"] |
| `dietary_restrictions` | TEXT[] | default [] | e.g. ["vegetarian", "gluten-free"] |
| `injuries` | TEXT | nullable | Free-text notable injuries |
| `status` | ENUM | not null, default `trial` | `trial`, `active`, `paused`, `cancelled` |
| `crisis_hold` | BOOLEAN | not null, default false | True = AI coaching suspended |
| `registered_at` | TIMESTAMPTZ | not null, default now() | |
| `last_active_at` | TIMESTAMPTZ | nullable | Updated on each inbound message |

**Indexes**: `phone_number` (unique), `status`, `last_active_at`

**Validation Rules**:
- `phone_number` must match E.164 format
- `coaching_focus` must be one of the four enum values
- `goals` must not be empty

---

### Subscription

Tracks Stripe trial and billing status. Never stores raw card data.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | UUID | PK, not null | Generated |
| `user_id` | UUID | FK → User.id, UNIQUE, not null | One subscription per user |
| `stripe_customer_id` | VARCHAR(50) | UNIQUE, not null | `cus_xxx` from Stripe |
| `stripe_subscription_id` | VARCHAR(50) | UNIQUE, not null | `sub_xxx` from Stripe |
| `plan` | ENUM | not null | `individual` ($20/mo), `coach_pro` ($99/mo), `coach_elite` ($149/mo) |
| `status` | ENUM | not null | `trialing`, `active`, `past_due`, `cancelled` |
| `trial_start` | TIMESTAMPTZ | not null | |
| `trial_end` | TIMESTAMPTZ | not null | `trial_start + 30 days` |
| `current_period_end` | TIMESTAMPTZ | nullable | Set by Stripe on each renewal |
| `created_at` | TIMESTAMPTZ | not null, default now() | |
| `updated_at` | TIMESTAMPTZ | not null, default now() | Updated on each Stripe webhook |

**Stripe Webhook → Status Mapping**:
- `customer.subscription.created` → `trialing`
- `customer.subscription.updated` (trialing→active) → `active`
- `invoice.payment_failed` → `past_due`
- `customer.subscription.deleted` → `cancelled`

---

### ConversationSession

Groups messages into bounded sessions. Sessions expire after `SESSION_TIMEOUT_HOURS` (default 4h) of inactivity.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | UUID | PK, not null | Generated |
| `user_id` | UUID | FK → User.id, not null | |
| `status` | ENUM | not null, default `active` | `active`, `completed`, `crisis_hold` |
| `message_count` | INTEGER | not null, default 0 | Incremented on each message |
| `summary_generated` | BOOLEAN | not null, default false | True once summary written |
| `started_at` | TIMESTAMPTZ | not null, default now() | |
| `last_message_at` | TIMESTAMPTZ | nullable | Updated on each message |
| `ended_at` | TIMESTAMPTZ | nullable | Set when session expires or completes |

**Indexes**: `user_id`, `status`, `last_message_at`

**Session Boundary Logic**:
- Redis key `session:{userId}` TTL = `SESSION_TIMEOUT_HOURS * 3600`
- On Redis TTL expiry: mark session `completed`, trigger summary generation, create new session on next message
- On crisis: set status to `crisis_hold`; create new session only after coach resolves alert

---

### Message

Individual inbound or outbound message in a session.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | UUID | PK, not null | Generated |
| `session_id` | UUID | FK → ConversationSession.id, not null | |
| `user_id` | UUID | FK → User.id, not null | Denormalised for query performance |
| `role` | ENUM | not null | `user`, `ai` |
| `message_type` | ENUM | not null, default `text` | `text`, `mms` |
| `content` | TEXT | not null | SMS body text |
| `media_url` | TEXT | nullable | Twilio MMS media URL (MMS only) |
| `media_content_type` | VARCHAR(50) | nullable | e.g. `image/jpeg` |
| `twilio_sid` | VARCHAR(50) | nullable | `SMxxx` from Twilio for dedup |
| `token_count` | INTEGER | nullable | Logged for token-efficiency gate |
| `created_at` | TIMESTAMPTZ | not null, default now() | |

**Indexes**: `session_id`, `user_id + created_at` (compound, for sliding window queries), `twilio_sid` (unique, for idempotency)

---

### NutritionalAnalysis

Stores the result of Claude Vision food photo analysis. One per MMS message.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | UUID | PK, not null | Generated |
| `message_id` | UUID | FK → Message.id, UNIQUE, not null | One analysis per MMS message |
| `user_id` | UUID | FK → User.id, not null | Denormalised |
| `detected_foods` | TEXT[] | not null | e.g. ["grilled chicken", "brown rice"] |
| `total_calories` | SMALLINT | nullable | Estimated; null if no food detected |
| `protein_grams` | SMALLINT | nullable | |
| `carbs_grams` | SMALLINT | nullable | |
| `fat_grams` | SMALLINT | nullable | |
| `health_flags` | TEXT[] | default [] | e.g. ["high_sodium_for_hypertension"] |
| `recommendation` | TEXT | nullable | One dietary recommendation |
| `confidence_score` | DECIMAL(4,3) | nullable | 0.000–1.000 |
| `food_identified` | BOOLEAN | not null, default true | False if no food in image |
| `created_at` | TIMESTAMPTZ | not null, default now() | |

---

### CrisisAlert

Logged when the crisis classifier exceeds the confidence threshold. One per detection event.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | UUID | PK, not null | Generated |
| `user_id` | UUID | FK → User.id, not null | |
| `triggering_message_id` | UUID | FK → Message.id, not null | The message that triggered detection |
| `detection_method` | ENUM | not null | `keyword`, `ml_classifier`, `hybrid` |
| `confidence_score` | DECIMAL(4,3) | nullable | ML model confidence (0–1) |
| `holding_message_sent` | BOOLEAN | not null, default false | |
| `holding_message_sent_at` | TIMESTAMPTZ | nullable | |
| `coach_alerted` | BOOLEAN | not null, default false | |
| `coach_alerted_at` | TIMESTAMPTZ | nullable | |
| `coach_alert_channel` | ENUM | nullable | `sms`, `email` |
| `status` | ENUM | not null, default `open` | `open`, `acknowledged`, `resolved` |
| `resolved_by` | VARCHAR(100) | nullable | Coach identifier |
| `resolved_at` | TIMESTAMPTZ | nullable | |
| `created_at` | TIMESTAMPTZ | not null, default now() | |

**Indexes**: `user_id`, `status`, `created_at`

**SLA Monitoring**: `coach_alerted_at - created_at` must be ≤ 5 minutes. Alert if SLA breached.

---

### SessionSummary

Claude-generated summary of a completed session. Used as long-term context for returning users.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | UUID | PK, not null | Generated |
| `user_id` | UUID | FK → User.id, not null | |
| `session_id` | UUID | FK → ConversationSession.id, not null | |
| `summary` | TEXT | not null | 100–200 word coaching context summary |
| `message_count_summarised` | INTEGER | not null | How many messages were summarised |
| `trigger` | ENUM | not null | `session_expiry`, `message_count`, `token_budget` |
| `created_at` | TIMESTAMPTZ | not null, default now() | |

---

## Redis Schema

| Key Pattern | Type | TTL | Contents |
|-------------|------|-----|----------|
| `session:{userId}` | String (JSON) | `SESSION_TIMEOUT_HOURS * 3600` | Array of last 20 `{role, content}` messages |
| `bull:sms` | List | — | BullMQ outbound SMS queue |
| `bull:coaching` | List | — | BullMQ coaching message queue |
| `bull:crisis` | List | — | BullMQ crisis detection queue |
| `bull:stripe` | List | — | BullMQ Stripe webhook queue |

---

## State Transitions

### User.crisis_hold
```
false → true   : CrisisAlert created, status = open
true  → false  : CrisisAlert status = resolved, coach action required
```

### ConversationSession.status
```
active → completed    : Session TTL expired, summary generated
active → crisis_hold  : Crisis detected (mirrors User.crisis_hold)
crisis_hold → active  : Coach resolves CrisisAlert
```

### Subscription.status
```
trialing → active      : Trial period ends, first charge succeeds
trialing → cancelled   : User cancels during trial
active → past_due      : Payment fails
past_due → active      : Payment retry succeeds
past_due → cancelled   : Payment retry exhausted
```

---

## Migration Notes

- All UUIDs generated with `gen_random_uuid()` (PostgreSQL 13+)
- `TEXT[]` arrays used for health conditions and dietary restrictions to avoid junction tables at MVP scale
- `token_count` on Message is nullable — populated asynchronously; not required for processing
- `twilio_sid` unique index on Message prevents duplicate processing of retried webhooks
