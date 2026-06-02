---
id: 004
title: Conversion-optimized intake script overhaul
stage: green
date: 2026-06-02
surface: agent
model: claude-opus-4-8
feature: onboarding-variants
branch: feat/onboarding-variant-routing
user: usekiba0
command: general chat (client feedback)
labels: [onboarding, sms, conversion, sales, intake-prompt, stripe]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/ai/prompts/intake.prompt.ts (rewrote BUILD→close emotional sequence; config-driven trial/price; fixed pre-existing over-escaped apostrophes)
 - backend/src/data/entities/user.entity.ts (added IntakeData.why_it_matters)
 - backend/src/messaging/coaching.processor.ts (why_it_matters whitelist; trialDays/priceDisplay into ctx; STRIPE_TRIAL_DAYS default 30→7)
 - backend/src/ai/coaching.service.ts (save_intake_field gains why_it_matters; send_payment_link timing = after micro-commitment)
 - backend/tests/unit/intake-prompt.spec.ts (new — 6 cases)
tests:
 - npx tsc --noEmit → EXIT=0
 - jest unit (full) → 41 suites / 376 tests passed
---

## Prompt

Client confirmed three locked decisions for the conversion-script overhaul:
(1) state price/trial in text, (2) move the payment link to AFTER the full
emotional build, (3) variants first (already shipped). Follow-up clarifiers
resolved: 7-day trial (was configured 30), $20/month price label.

Implement the new conversion-optimized onboarding script as adaptive AI guidance
(not a fixed script), playing off what each person says.

## Response snapshot

Rewrote the intake prompt into a single pre-link BUILD phase running the ordered
emotional sequence: name → goals/main goal → why → obstacle → "I see you"
moment → value-before-ask → tone+time → micro-commitment → close+link. Money is
withheld until the close (step 9); the code gate stays at the functional floor
(name/goal/tz) so a missed extraction can never brick payment. Post-link phases
became "hold the close" + objection-handling paywall using the "X days free"
framing. Trial length and price are injected from config (STRIPE_TRIAL_DAYS=7,
STRIPE_PRICE_DISPLAY=$20/month) so SMS copy can never drift from Stripe billing.
Added why_it_matters intake field. Fixed a pre-existing over-escaped-apostrophe
bug in the prompt strings (\\\\' → \\').

## Outcome

- ✅ Impact: Onboarding now builds emotional investment before asking for money, states the real offer, and adapts per user — the core conversion change. Variant openers from PHR 003 preserved.
- 🧪 Tests: tsc clean; new intake-prompt suite (6) green; full unit suite 376/376.
- 📁 Files: 4 edited, 1 new spec.
- 🔁 Next prompts: multi-bubble send layer (script's [pause] = 2-3 texts; we send one/turn); no-response follow-up sequences (current dunning is 24h/72h × 2 — script wants 2-3h / next-day / 2-3day × 3 with its copy); "done" → first-plan build flow review.
- 🧠 Reflection: chose prompt-drives-timing + code-floor-gate over hard-gating every emotional step, to avoid the silent payment lockout this codebase is prone to.

## Evaluation notes (flywheel)

- Failure modes observed: over-escaped apostrophes (\\\\') produced literal backslashes in prompt text — caught by a toContain test; fixed file-wide.
- Graders run and results (PASS/FAIL): unit PASS (376/376); tsc PASS.
- Prompt variant (if applicable): BUILD / POST_LINK / PAYWALL phases in intake.prompt.ts.
- Next experiment (smallest change to try): once live, measure where leads drop in the 9-step build and consider trimming steps for the CASUAL variant.
