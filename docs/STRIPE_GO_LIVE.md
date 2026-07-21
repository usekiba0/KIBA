# Stripe test → live runbook

Everything here is dashboard + env work. **No code change is required to go live.**

Verified against the code on 2026-07-21:
`backend/src/onboarding/stripe.service.ts`, `stripe-webhook.controller.ts`, `app.module.ts`.

---

## 0. Pre-flight

- [ ] Stripe account is **activated** for live payments (business details + EIN verified).
      Until activation completes, live keys exist but charges are rejected.
- [ ] Confirm `APP_BASE_URL` on Render is the real public HTTPS base URL of the backend.
      The webhook URL in step 2 must match it exactly.
- [ ] Decide the real price. `STRIPE_PRICE_DISPLAY` is the label KIBA quotes in SMS —
      if it disagrees with the actual amount on the price object, the bot promises one
      number and Stripe charges another.

---

## 1. Recreate products and prices in LIVE mode

Toggle the dashboard to **Live mode** (top-right). Test-mode products do **not** exist in
live mode — they are separate objects with different IDs. This is the step people miss.

- [ ] Create the individual subscription product + recurring monthly price.
- [ ] Copy the price ID (`price_...`) → this becomes `STRIPE_PRICE_ID_INDIVIDUAL`.
- [ ] *(Optional)* Create the annual price → `STRIPE_PRICE_ID_INDIVIDUAL_ANNUAL`.
      Safe to skip: the plan page renders monthly-only when it's unset.
- [ ] If you use promotion codes, recreate them in live mode too —
      checkout is created with `allow_promotion_codes: true`.

`STRIPE_PRICE_ID_COACH_PRO` / `_COACH_ELITE` appear in `.env.example` but are read by
**no code**. Ignore them.

---

## 2. Create the LIVE webhook endpoint

Still in Live mode → Developers → Webhooks → Add endpoint.

- [ ] **URL:** `https://kiba-1.onrender.com/v1/webhooks/stripe`

  Note the **`/v1/`** — `main.ts` calls `app.setGlobalPrefix('v1')` with no exclusions,
  so every route including this webhook sits under it. The sibling SMS webhook is
  documented the same way (`/v1/webhooks/sms`, see `TWILIO_A2P_SETUP.md`). Omitting
  `/v1` gives a 404 on every event: the card is charged, but the user is never
  activated and never hears back.
- [ ] **Events** — select exactly these 7, the ones the controller handles:

  | Event | What it drives |
  |---|---|
  | `checkout.session.completed` | activates the user after the SMS payment link |
  | `customer.subscription.created` | records the subscription + `livemode` |
  | `customer.subscription.trial_will_end` | pre-trial-end nudge |
  | `customer.subscription.updated` | status transitions |
  | `customer.subscription.deleted` | cancellation |
  | `invoice.payment_succeeded` | renewal |
  | `invoice.payment_failed` | dunning |

- [ ] Copy the **signing secret** (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`.

The signing secret is **per endpoint and per mode**. The test-mode secret will not
verify live events — signature check fails and every live webhook 400s.

---

## 3. Swap env vars on Render

| Var | New value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from step 2 |
| `STRIPE_PRICE_ID_INDIVIDUAL` | `price_...` from step 1 |
| `STRIPE_PRICE_ID_INDIVIDUAL_ANNUAL` | *(optional)* |
| `STRIPE_PRICE_DISPLAY` | must match the real amount, e.g. `$20/month` |
| `STRIPE_TRIAL_DAYS` | `3` |

All are validated at boot by Joi (`app.module.ts`). A missing required var fails the
deploy loudly rather than starting in a broken state — that's intended.

- [ ] Redeploy after saving.

---

## 4. Verify (do this immediately, with a real card)

- [ ] Trigger the SMS signup flow end to end and pay with a real card.
- [ ] Stripe → Webhooks → the live endpoint shows **200** for
      `checkout.session.completed` and `customer.subscription.created`.
- [ ] DB: the new `subscriptions` row has **`livemode = true`**.
- [ ] Admin dashboard MRR moves by the real amount.
- [ ] KIBA's confirmation SMS quotes the same price the card was charged.
- [ ] Cancel and refund that test subscription once verified.

Old test-mode subscriptions stay in the DB with `livemode = false` and are already
excluded from real MRR (`admin.service.ts`), so they will not pollute the numbers.

Replayed events are deduped by `stripe_event_id`, so a Stripe retry is safe.

---

## 5. Rollback

Swap the env vars back to the `sk_test_` / test price / test `whsec_` values and
redeploy. No data migration, no code revert. Live subscriptions created in the interim
remain in Stripe and must be cancelled there.

---

## Known gap to close before launch

`STRIPE_TRIAL_DAYS` validates with a Joi default of `3`, but two call sites read it with
a hardcoded fallback of `7` (`checkin.processor.ts:379,437`). Joi always supplies the
value in practice, so the fallback is currently dead code — but it contradicts the 3-day
trial decision, and if validation is ever bypassed KIBA's copy would quote a 7-day trial
while Stripe bills after 3. Two-line fix.
