---
id: 003
title: Ad-keyword onboarding variant routing
stage: green
date: 2026-06-02
surface: agent
model: claude-opus-4-8
feature: onboarding-variants
branch: master
user: usekiba0
command: general chat (client feedback)
labels: [onboarding, sms, ads, conversion, intake-prompt]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/data/entities/user.entity.ts (added OnboardingVariant enum + onboarding_variant column)
 - backend/src/messaging/onboarding-variant.ts (new — keyword → variant detector)
 - backend/src/messaging/coaching.processor.ts (detect + persist variant at lead creation; pass into intake ctx)
 - backend/src/ai/prompts/intake.prompt.ts (variant-branched OPENING block + ctx.variant)
 - backend/src/data/migrations/1780300000000-AddOnboardingVariant.ts (new enum type + column)
 - backend/tests/unit/onboarding-variant.spec.ts (new — 5 detector cases)
tests:
 - npx tsc --noEmit -p tsconfig.json → EXIT=0
 - jest unit/onboarding-variant → 5 passed
 - jest unit/coaching → passed (62 passed overall in unit/coaching run)
 - jest integration/onboarding → 6 failed (pre-existing: beforeAll needs live DB/Stripe; env-gated, not caused by this change)
---

## Prompt

Client feedback: ads use SMS deep-links with different pre-filled messages
(e.g. "what even is kiba" vs "what's up kiba"). Can a different pre-filled
message trigger a different onboarding flow / response, or does it have to be
the same for everything? Also: a long conversion-optimized onboarding script was
provided — is it better than current, and can the AI play off what the person
says rather than reciting a fixed script?

Decisions captured via question prompt:
- Price/trial stated in text (per the new script): YES
- Payment link timing: AFTER the full emotional build (not the current fast path)
- Build order: VARIANTS FIRST

## Response snapshot

Explained that (a) the pre-filled text already arrives as the lead's first
inbound and was simply never inspected — every new number hit one flow; and
(b) onboarding is already 100% LLM-driven off intake.prompt.ts, so it already
adapts to the user (the new script becomes guidance/rhythm, not hardcoded copy).

Implemented the variants-first slice: OnboardingVariant enum
(standard/explainer/casual), a data-driven keyword detector, persisted the
variant once at lead creation, and branched the intake prompt's OPENING by
variant. Price-in-text and link-after-emotional-build (the script overhaul) are
deferred to the next pass per the chosen build order.

## Outcome

- ✅ Impact: Different ad pre-fills now open with different first replies, all funnelling into the same intake → payment flow. Foundation for variant-dependent funnels later.
- 🧪 Tests: typecheck clean; new detector suite green; coaching unit green; onboarding integration failures are pre-existing env-gated DB/Stripe.
- 📁 Files: 4 edited, 2 new (detector + spec), 1 migration.
- 🔁 Next prompts: rewrite intake prompt for the new emotional-build script (Text 6 "I see you", Text 7 value-before-ask, micro-commitment), move link to post-build, add price-in-text, multi-bubble send layer, no-response follow-up sequences.
- 🧠 Reflection: kept the slice tight — routing + openers only — to match the "variants first" decision and avoid entangling the larger script-strategy change.

## Evaluation notes (flywheel)

- Failure modes observed: apostrophe normalisation initially split "what's" into "what s"; fixed by stripping apostrophes before punctuation→space.
- Graders run and results (PASS/FAIL): detector unit PASS (5/5); tsc PASS.
- Prompt variant (if applicable): explainer / casual / standard openers in intake.prompt.ts.
- Next experiment (smallest change to try): A/B the explainer opener's first line against a shorter version once live.
