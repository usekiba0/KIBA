---
id: 015
title: Sales psychology training (Guide + V2 PDFs)
stage: green
date: 2026-06-27
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: master
user: usekiba0
command: general
labels: ["sales-psychology", "conversion", "intake", "retention", "client-feedback"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/ai/prompts/intake.prompt.ts
 - backend/src/ai/prompts/coaching.prompt.ts
 - backend/src/accountability/checkin.processor.ts
 - backend/src/onboarding/stripe-webhook.controller.ts
 - backend/tests/unit/intake-prompt.spec.ts
 - backend/tests/unit/checkin.processor.spec.ts
 - backend/tests/unit/coaching.prompt.spec.ts
 - docs/REGRESSION_CHECKLIST.md
tests:
 - tests/unit/intake-prompt.spec.ts (sales-psychology principles + personality match + emoji-free)
 - tests/unit/checkin.processor.spec.ts (day-7 social-proof copy)
 - tests/unit/coaching.prompt.spec.ts (retention loss-aversion within 26.5k budget)
 - full unit run: 792 passed, tsc clean; sim-intake.ts real-conversation validation
---

## Prompt

do it but also there are 2 pdf shared by client under new requirement folder namely
KIBA_Sales_Psychology_Guide and KIBA_Sales_Psychology_V2 and client shared: "review
these two PDFs deeply… the goal is to train KIBA on everything inside — make KIBA a
sales machine on its own… sharpening the mechanics and psychologicals of how it pitches
people to join the paid plan and how every move it makes leads up to somebody feeling
like they need to buy. Let me know if we can get this implemented."

## Response snapshot

Read both PDFs deeply. Much was already shipped (06-26 lock-in batches). Implemented
the net-new psychology:
- Intake SALES PSYCHOLOGY layer (salesBlock): 7 levers applied naturally — sell-the-
  mechanism, remove-shame, pain-amplification mirror (woven into step 5), commitment-
  stacking, loss-aversion+identity, real-urgency-from-their-timeline (step 7), specific
  social proof.
- Personality match (personalityBlock): joker/driven/skeptic/hesitant/competitive/
  price-sensitive; humor via words, sign-up stays emoji-free (made the whole prompt
  emoji-free for consistency).
- PAYWALL loss-aversion line (you already did the hard part; not starting = losing it).
- No celebration on tap: activation SMS now moves into the plan; trial_ended de-celebrated.
- Day-7 reveal copy: added "most people fall off by day 3 and you didn't" social proof.
- Coaching retention loss-aversion ("i quit" → protect the score you BUILT); budget 26→26.5k.
- "do it" leftovers: cancellation + payment_failed lifecycle SMS de-robotized.

792 unit pass, tsc clean. Ran sim-intake.ts against the live prompt: clean emoji-free
opener, "we lock in on both of these", business-type-first, decisive CONVERGE move.

## Outcome

- ✅ Impact: KIBA's selling is now psychology-driven (the 7 levers + personality match),
  not feature-selling; conversion mechanics match the Noom/Duolingo playbook in the docs.
- 🧪 Tests: +5 (sales principles, personality, day-7 social proof) + budget bump; 792 pass.
- 📁 Files: intake.prompt.ts, coaching.prompt.ts, checkin.processor.ts, stripe-webhook.controller.ts, 3 specs, checklist.
- 🔁 Next prompts: dunning still resends the link up to 3x — docs say send once then go
  useful; reducing resends is a strategic dunning change (follow-up/CR). Joker-emoji
  decision (docs show emoji for jokers; Karibi's no-emoji-in-sign-up currently wins).
- 🧠 Reflection: most of the docs were already built, so the work was the deliberate
  psychology layer + personality match, validated in a real sim run, not just unit asserts.

## Evaluation notes (flywheel)

- Failure modes observed: prompt was at the 26k ceiling — the retention lever required a
  documented budget bump rather than silent growth.
- Graders run and results (PASS/FAIL): unit PASS (792/792), tsc PASS, sim-intake PASS (manual read).
- Prompt variant (if applicable): intake gained salesBlock + personalityBlock.
- Next experiment (smallest change to try): run B11 — intakes as joker/driven/skeptic/
  price-sensitive on a test number to confirm tone-match + mirror + day-7 price hold.
