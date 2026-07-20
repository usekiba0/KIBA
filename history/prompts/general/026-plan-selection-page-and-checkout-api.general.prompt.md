---
id: 026
title: Plan selection page and checkout API
stage: green
date: 2026-07-21
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: feat/affiliate-referral-codes
user: usekiba0
command: (chat) continue
labels: ["checkout","stripe","pricing","monthly-yearly","signed-token","paywall","beta-launch"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/onboarding/checkout-link.ts (new, dependency-free HMAC token helpers)
 - backend/src/onboarding/checkout.service.ts (new)
 - backend/src/onboarding/checkout.controller.ts (new, public/unguarded by design)
 - backend/src/onboarding/onboarding.module.ts (CheckoutController + CheckoutService, module-local)
 - backend/src/onboarding/stripe.service.ts (getPrice)
 - backend/src/app.module.ts (optional STRIPE_PRICE_ID_INDIVIDUAL_ANNUAL, CHECKOUT_LINK_SECRET)
 - frontend/src/app/plan/page.tsx (new, Tomo-style paywall)
 - backend/tests/unit/checkout-link.spec.ts (new, 15 assertions)
tests:
 - backend unit: 75 suites, 968 passed
 - backend tsc --noEmit: clean
---

## Prompt

continue

(Resumed after `/compact`. The preceding turn had left the checkout work
uncommitted pending five open questions to the user.)

## Response

Verified the tree, typechecked, ran the unit suite, then committed the
plan-selection work locally as `204538d`. Did **not** push — whether to push
`feat/affiliate-referral-codes` and open PRs is one of the five questions still
outstanding with the user, and PR #14 has to merge first regardless.

Key decisions already baked into the committed code:

- Monthly/yearly is chosen on **our** page, not in Stripe. A single Stripe
  subscription Checkout session can't render a plan toggle, so the page hands
  Stripe only the price the user tapped.
- The link is a **stateless HMAC token**, not a DB row — nothing to migrate,
  nothing to expire-sweep, and user ids can't be enumerated by walking the URL.
- `checkout-link.ts` is deliberately dependency-free. `CoachingProcessor` calls
  `planLinkFor()` directly rather than injecting `CheckoutService`, because
  sharing that provider across `MessagingModule` and `OnboardingModule` (which
  already import one another) overflows the Nest injector's stack.
- Prices are read **live from Stripe** on every page load. No amount is
  hardcoded or mirrored in our DB, so the page can never quote a stale price and
  the pricing decision stays entirely the user's.
- `STRIPE_PRICE_ID_INDIVIDUAL_ANNUAL` is optional: until it's set the page
  renders monthly-only rather than showing a broken paywall. Safe to deploy
  before the annual price exists.
- No fabricated social proof on the page — KIBA is pre-launch.

## Outcome

- [x] tsc clean, 968/968 unit tests pass
- [x] committed locally as `204538d`
- [ ] not pushed — awaiting the user's go-ahead
- [ ] blocked on: annual price id, card-vs-comped for the 20 beta users, the
      real KIBA domain, which project the go-live checklist belongs to

## Follow-ups / risks

- Merge order still matters: PR #14 (`fix/queue-drain-and-reminder-dedup`) first,
  then this branch, which stacks on it.
- `CHECKOUT_LINK_SECRET` falls back to `INTERNAL_API_KEY`; rotating either
  invalidates outstanding plan links, which is correct but worth knowing before
  a rotation during beta.
- The `/plan` page links to `/terms` and `/privacy`, which don't exist yet — the
  fine print is plain text for now.
