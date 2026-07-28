---
id: 053
title: Confirm trial days three on Render
stage: general
date: 2026-07-29
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (freeform request)
labels: ["training-doc-v2", "prelaunch", "p0", "stripe", "trial-window"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/ai/prompts/intake.prompt.ts
 - backend/tests/unit/training-doc-v2.spec.ts
tests:
 - full unit suite — 95 suites / 1301 tests pass
 - tsc --noEmit clean
---

## Prompt

stripe tiral days is 3 on render .

(followed mid-turn by: "3) i have stopped the other function so that ou can continue working")

## Response snapshot

Founder confirmed the live Render value: `STRIPE_TRIAL_DAYS = 3`.

This settles the open question from PHR 052 and confirms the direction of the P0.4 fix. Training Doc v2 instructed "hard-code 7 days as the ONLY challenge window language" — following that literally would have INTRODUCED the bug it was trying to fix, because KIBA quoting "3 days" was correct against a 3-day trial. The genuine defect was the reverse: hardcoded "day 7" price-reveal copy. Config-driven `revealDay` now renders "day 3" and matches billing.

Swept the whole backend for remaining week-shaped copy and found one live prompt string that had survived: the PAYWALL-phase rule "do NOT bring up price — that conversation happens on day 7". It slipped through the new test because the default test context is `paymentLinkSent: false` → BUILD phase, and the PAYWALL block is never rendered there. Fixed the string and parameterised the assertion over all three intake phases (BUILD / POST_LINK / PAYWALL) so a hardcoded duration can't hide in an unrendered branch again. Also corrected a now-stale rationale comment.

Everything else the sweep surfaced is legitimate: the 7-day streak milestone, the weekly review cadence, admin 7-day analytics windows, and "miami's in 7 days" (an example of the USER's own deadline, not the trial).

Flagged a consequence of the 3-day trial worth knowing before launch: Stripe fires `trial_will_end` three days BEFORE the trial ends, which on a 3-day trial is signup. With the ledger gate requiring 2+ elapsed days AND 2+ execution days, that touchpoint now never fires on the live config. That is the correct behaviour per the doc (silence beats fabricated praise) but it means the price reveal is the only pre-charge message. It self-heals if the trial is ever lengthened.

Concurrent session that was editing vision.service.ts / model-params.ts has been stopped by the user, so the working tree is now single-writer.

## Outcome

- ✅ Impact: last hardcoded trial-window string removed; P0.4 verified correct against the real Render config.
- 🧪 Tests: 95 suites / 1301 tests pass (+3 from phase parameterisation); tsc clean.
- 📁 Files: 1 source file, 1 spec.
- 🔁 Next prompts: run the doc's 5-persona onboarding sim (2 fake-proof, 1 ambiguous-input, 1 ghost-confession); decide whether the now-dead mid-trial touchpoint should be replaced with a day-1 or day-2 message.
- 🧠 Reflection: a prompt built from phase-branched blocks needs assertions across every phase — a single default context tests one branch and reports green for all of them.

## Evaluation notes (flywheel)

- Failure modes observed: the first version of the P0.4 test gave a false green because the default context only rendered the BUILD phase. Branch-shaped prompt builders need branch-shaped tests.
- Graders run and results (PASS/FAIL): unit suite PASS (1301/1301); tsc PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): grep the other phase-branched prompt builders (winback, payment-claim) for durations rendered in only one branch.
