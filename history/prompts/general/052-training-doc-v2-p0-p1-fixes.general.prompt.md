---
id: 052
title: Training Doc v2 P0 and P1 fixes
stage: general
date: 2026-07-29
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (freeform request)
labels: ["training-doc-v2", "prelaunch", "p0", "proof-enforcement", "hallucination", "close-discipline"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/onboarding/stripe-webhook.controller.ts
 - backend/src/accountability/proof.service.ts
 - backend/src/data/entities/user.entity.ts
 - backend/src/ai/prompts/intake.prompt.ts
 - backend/src/ai/prompts/coaching.prompt.ts
 - backend/src/messaging/coaching.processor.ts
 - backend/tests/unit/training-doc-v2.spec.ts (new)
 - backend/tests/unit/coaching.prompt.spec.ts
 - backend/tests/unit/proof.service.spec.ts
 - backend/tests/unit/stripe-reactivation.spec.ts
 - backend/tests/unit/stripe-goal-bridge.spec.ts
tests:
 - backend/tests/unit/training-doc-v2.spec.ts (22 new cases, all pass)
 - full unit suite — 95 suites / 1298 tests pass
 - tsc --noEmit clean
---

## Prompt

do whats needed

## Response snapshot

Audited the codebase against KIBA Training Doc v2 and implemented the complete P0 + P1 checklist.

### P0 — launch blockers

**P0.1 Post-purchase hallucination.** The trial_will_end handler was already gated on elapsed time (PR #48) but the gate was the wrong one: a user subscribed 5 days who has done nothing still got "few days in and you're actually showing up". Replaced with a real ledger check (`ScoreService.countExecutionDays`) AND kept the elapsed check — both must hold. Copy now states the verified count instead of a vague duration. Also fixed the adjacent `trial_ended` message, which hardcoded "that's week one in the books" on a 3-day trial — same fabricated-duration class; it now derives the real length from trial_start/trial_end.

**P0.2 Fake proof accepted.** The PROOF SYSTEM rules were gym-shaped. Extended to a per-category spec: business/outreach (screenshot showing WHO, WHAT, timestamp), content, study, money, diet, and a vice category that deliberately accepts an honest text check-in on normal days but requires a context shot on trigger days. Added "WORDS ARE NEVER PROOF" and a hold-the-line rule so a non-gym goal isn't treated as more honour-system than a squat.

**P0.3 First-person hallucination.** No role-boundary rule existed anywhere. Added to both the coaching and intake prompts: never speak as the user, ambiguous input → clarify rather than execute, and never answer a question the user declined (the "doesn't matter" → "houston" case) — including an explicit rule that filling in a declined city from stored data is a hallucination.

**P0.4 Challenge window.** Found the inverse of what the doc assumed. `STRIPE_TRIAL_DAYS` defaults to 3 and the intake prompt already interpolates it, so "3 days" matched billing — but the prompt hardcoded "day 7"/"day-7" in five places for the price reveal, while the reveal job schedules off the real Stripe trial_end. Made every duration flow from one source (`revealDay = day ${d}`).

**Message stacking + pin timing.** Payment fired three back-to-back sends (activation, contact card, pin nudge) and asked for the pin before the user had done anything. Payment now sends exactly ONE message; the contact-card and pin asks moved to `ProofService.maybeSendActivationAsks`, fired once on the user's first accepted proof, flagged via `intake_data.activation_asks_sent_at` (JSONB — no migration, same pattern as weigh_in_schedule).

### P1

Closing amnesia (close must carry a specific disclosure callback); identity referendum (the banned pattern was literally the worked example in step 7 — replaced, and all four live instances added to a hard-ban list); name-reaction variation; cultural mirror with city → region → timezone fallback; menu-retreat guard on 4h+ replies including coded-confession keywords; apology must change question CATEGORY; vulnerability markers label-first/ask-second; and the deterministic root cause of P1.8 — `summariseKnown()` never surfaced city or checkin_time, so the model could not see them as settled and re-asked. Added both plus tone, marked SETTLED, threaded `checkinTime` through IntakeContext from the processor.

### Verification

New `training-doc-v2.spec.ts` with 22 cases pinning each numbered failure, including three webhook-level cases proving the ledger gate suppresses in both wrong states and sends the real count in the right one. Full suite 1298/1298, tsc clean. The coaching prompt size budget was raised 31.9k→36.4k with justification after a ~2.2k compression pass.

### Surfaced, not silently decided

- The doc asserts Stripe runs 7-day trials; the code default is 3. All copy is now config-driven so it is correct either way, but the live `STRIPE_TRIAL_DAYS` value on Render needs confirming.
- Name-reaction variation is a prompt rule, not a deterministic module — the doc's verification (10 flows, all different) needs a live sim.
- Section 5 "new systems", the deliverable engine for behavioural goals, and interest-file routing were left alone — the doc marks them post-launch.
- The working tree contains concurrent edits to vision.service.ts / coaching.service.ts / app.module.ts / model-params.ts from another session (the proof-verification-on-Haiku work). Not touched, not staged.

## Outcome

- ✅ Impact: entire P0 + P1 pre-launch checklist from Training Doc v2 implemented and regression-tested.
- 🧪 Tests: 22 new cases; 95 suites / 1298 tests pass; tsc clean.
- 📁 Files: 6 source files, 1 new spec, 4 specs updated.
- 🔁 Next prompts: confirm live STRIPE_TRIAL_DAYS; run the doc's 5-persona onboarding sim (incl. 2 fake-proof, 1 ambiguous-input, 1 ghost-confession); then the section-5 systems post-launch.
- 🧠 Reflection: the doc's unifying diagnosis held up under audit — every confirmed bug was a message class rendering without reading conversation state. The two highest-value fixes were both deterministic state plumbing (ledger gate; city/checkin_time in the known-state block), not prompt persuasion.

## Evaluation notes (flywheel)

- Failure modes observed: the doc's P0.4 premise was inverted relative to the code — worth verifying a claimed bug against config before "fixing" it in the stated direction. Prompt-size budget is a real constraint on prompt-only fixes.
- Graders run and results (PASS/FAIL): unit suite PASS (1298/1298); tsc PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): run sim-intake with 5 persona openings and diff the name-reaction line across runs — the cheapest signal on whether P1.3 actually varies in practice.
