# Contract: Stripe Webhook Events

**Direction**: Stripe → RYKE AI Backend  
**Endpoint**: `POST /webhooks/stripe`  
**Trigger**: Stripe billing lifecycle events for RYKE AI subscriptions

---

## Security

- **Header**: `Stripe-Signature` (HMAC-SHA256 signed with STRIPE_WEBHOOK_SECRET)
- **Validation**: `stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)`
- **Raw body required**: `main.ts` must use `rawBody: true` in NestFactory options
- **On failure**: Return HTTP 400

## Events Handled

### `customer.subscription.created`

Fired when a new subscription is created (immediately after onboarding submit).

**Action**:
1. Look up user by `stripe_customer_id`
2. Update `subscription.status = 'trialing'`
3. Set `subscription.trial_end`
4. Queue welcome SMS via Messaging Layer
5. Return HTTP 200

**Idempotency key**: `stripe_event_id` — store in `processed_stripe_events` table; skip if already processed.

---

### `customer.subscription.trial_will_end`

Fired 3 days before trial expiry (Stripe default).

**Action**:
1. Look up user by `stripe_customer_id`
2. Queue reminder SMS: "Your RYKE AI trial ends in 3 days. You won't be charged unless you choose to continue."
3. Return HTTP 200

---

### `customer.subscription.updated`

Fired when subscription status changes.

**Action** (on `trialing → active`):
1. Update `subscription.status = 'active'`
2. Update `subscription.current_period_end`
3. Queue SMS: "Your free trial has ended and your coaching continues. Welcome to RYKE AI."
4. Return HTTP 200

**Action** (on `active → past_due`):
1. Update `subscription.status = 'past_due'`
2. Queue SMS notifying user of payment issue

---

### `invoice.payment_failed`

Fired when a subscription charge fails.

**Action**:
1. Update `subscription.status = 'past_due'`
2. Queue SMS: "We couldn't process your RYKE AI payment. Please update your card at ryke.ai."
3. Do NOT suspend coaching immediately — give Stripe's retry window (configurable, default 4 attempts over 7 days)
4. Return HTTP 200

---

### `invoice.payment_succeeded`

Fired on successful charge.

**Action**:
1. Update `subscription.status = 'active'`
2. Update `subscription.current_period_end`
3. Log renewal — no user-facing SMS required
4. Return HTTP 200

---

### `customer.subscription.deleted`

Fired when subscription is cancelled (user-initiated or payment exhausted).

**Action**:
1. Update `subscription.status = 'cancelled'`
2. Update `user.status = 'cancelled'`
3. Queue SMS: "Your RYKE AI subscription has ended. Text us any time to reactivate."
4. Return HTTP 200

---

## Response Contract

- **Status**: HTTP 200 for all handled events
- **Status**: HTTP 400 for invalid signature or malformed event
- **Body**: Empty

## Idempotency

All Stripe webhook handlers must check `processed_stripe_events` before processing:

```sql
CREATE TABLE processed_stripe_events (
  stripe_event_id VARCHAR(50) PRIMARY KEY,
  event_type      VARCHAR(100) NOT NULL,
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Insert before processing; if INSERT conflicts, event already handled — return 200 without re-processing.
