---
id: 005
title: Multi-bubble texting + follow-up sequences
stage: green
date: 2026-06-02
surface: agent
model: claude-opus-4-8
feature: onboarding-variants
branch: feat/onboarding-variant-routing
user: usekiba0
command: general chat (client feedback)
labels: [onboarding, sms, dunning, follow-up, multi-bubble, stripe]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/messaging/bubbles.ts (new — splitBubbles on [pause] marker)
 - backend/src/messaging/coaching.processor.ts (saveAndSend sends bubbles w/ delay; first nudge 24h→2.5h)
 - backend/src/ai/prompts/intake.prompt.ts ([pause] burst instruction)
 - backend/src/accountability/checkin.processor.ts (3-step personalized follow-ups + fresh-link regen; inject StripeService + ConfigService; export buildDunningNudge)
 - backend/tests/unit/bubbles.spec.ts (new — 6 cases)
 - backend/tests/unit/dunning-nudge.spec.ts (new — 5 cases)
 - backend/tests/unit/checkin.processor.spec.ts + checkin-resilience.spec.ts (register new providers)
tests:
 - npx tsc --noEmit → EXIT=0
 - jest unit (full) → 43 suites / 387 tests passed
---

## Prompt

"yes work on last 2 pieces" — implement the remaining two parts of the
conversion-script overhaul: (1) multi-bubble texting (the script's [pause] style
= 2-3 separate texts per turn) and (2) the no-response follow-up sequences
(2-3h → next day → 2-3 days) with personalized copy.

## Response snapshot

PIECE 1 — multi-bubble: new pure splitBubbles() splits an AI reply on [pause]
markers (matches the client's script notation), capped at 4 bubbles. saveAndSend
stores the marker-free reply as one row but sends each bubble as its own message
with a configurable gap (MESSAGE_BUBBLE_DELAY_MS, default 1200ms). Intake prompt
told it may use [pause] for bursts (esp. the "i see you" moment + close).

PIECE 2 — follow-up sequence: replaced the 2-nudge 24h/72h dunning with a
3-nudge cadence (~2.5h → ~next day → ~2-3 days). buildDunningNudge() (pure,
exported, tested) writes each nudge in KIBA's voice personalized with the lead's
goal + obstacle, with graceful fallbacks (never renders undefined). Each nudge
now regenerates a FRESH Stripe checkout link (the original session expires at
24h — the Stripe code comment already documented this regen as the intended
behavior; this resolves the open "dunning-nudge dead-link regen" issue). Falls
back to a reply CTA if Stripe regen fails. Injected StripeService + ConfigService
into CheckinProcessor (StripeService is exported by DataModule, already imported
by AccountabilityModule — no module surgery).

## Outcome

- ✅ Impact: Onboarding now texts in natural bursts and chases unpaid leads 3x with personalized, always-live links. Completes the conversion-script overhaul (PHR 004) and closes the dead-link regen backlog item.
- 🧪 Tests: tsc clean; +11 new unit tests; full unit suite 387/387 (fixed 2 specs that needed the new providers).
- 📁 Files: 4 src edited/new, 4 test files.
- 🔁 Next prompts: optional — apply [pause] bursts to the coaching prompt too; tune MESSAGE_BUBBLE_DELAY_MS; open PR for Karibi review.
- 🧠 Reflection: reused the documented-but-unimplemented regen intent rather than inventing new behavior; kept coaching.processor.sendPaymentLink untouched to avoid destabilizing the freshly-overhauled close.

## Evaluation notes (flywheel)

- Failure modes observed: adding 2 constructor deps broke 2 NestJS TestingModule specs (missing providers) — caught by full unit run, fixed by registering mocks.
- Graders run and results (PASS/FAIL): unit PASS (387/387); tsc PASS.
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): measure reply rate per nudge index to see if 3 is the right count or if a 4th converts.
