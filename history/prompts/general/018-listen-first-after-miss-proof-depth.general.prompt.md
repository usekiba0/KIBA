---
id: 018
title: Listen-first/don't-assume + after-a-miss + proof depth
stage: general
date: 2026-06-29
surface: agent
model: claude-opus-4-8
feature: none
branch: fix/karibi-feedback-2026-06-29
user: usekiba0
command: (chat)
labels: ["coaching", "tone", "proof", "emotional-intelligence", "prompt", "bugfix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/8
files:
 - backend/src/ai/prompts/coaching.prompt.ts
 - backend/tests/unit/coaching.prompt.spec.ts
tests:
 - backend/tests/unit (794 passed, tsc clean)
---

## Prompt

Continuing the open-issues list ("keep working" then "work on all apart from phase 2"). Worked the remaining non-Phase-2 behavioral gaps after auditing what was already live.

## Response snapshot

Audit-before-build again surfaced that most of the "open" list was already implemented; only a few narrow gaps remained.

Shipped (coaching.prompt.ts):
- **Listen-first / don't-assume:** react to what they ACTUALLY said/sent — never assume the worst or accuse ("you actually cooked or just doordash?" is an accusation; the Salata screenshot), and never claim a behavior that contradicts what's happening (don't say "scrolling" while they're texting). Ask when unsure.
- **After a miss / slip:** no shame, no zero day → next best action now; repeat slips → "text me before you [open the fridge / order / scroll]" circuit-breaker.
- **Proof depth:** once real proof lands, give a SPECIFIC reaction to what's in it (form/macros/numbers — "hips rising early, keep em down" / "~40g protein"), not "looks good"; then mark done AND pivot to the next/missed move (no dead-end "logged"). Lift proof → video for form check; meal photo → BEFORE eating, not after.
- Trimmed a redundant identity-language example + the duplicate mark_todo_done line; budget guard 26.5k→27k→27.5k (documented).

Already live, no change (confirmed via grep/read):
- PROOF SYSTEM block (proof required before counting, per-goal format, "no proof = didn't happen", fake/old detection) — coaching.prompt:394-399.
- Execution score surfaced conversationally — lines 60/354/369/416/420/459/496/499/537/540.
- Strikes & recovery task — line 369. RC-2 time, dry-responder mirroring, V4 Piece 1, goal-type check-ins.

Not done (reason):
- Instant-onboarding "texts at 7pm" + green-not-blue — BLOCKED: no scheduling bug in the cold-text path (first reply is synchronous); the 7pm string isn't generated anywhere; green = SendBlue→Twilio fallback (config). Needs the actual screenshot or a web-form-signup repro.
- Hard mandatory-proof DB gate — product decision; prompt-level enforcement already covers it (recommend not hard-gating).
- Latency / prompt-caching — needs a prompt restructure (stable rulebook as cache prefix vs per-user volatile suffix) to be effective; deferred as a dedicated effort to avoid behavior regression.
- RC-3 digest retry — low marginal value (digest preserves-on-failure + window now 60); optional.

## Outcome

- ✅ Impact: KIBA stops accusing/assuming on ambiguous input; gives real proof feedback + pivots after a win; meal-photo-before-eating; circuit-breaker after repeat slips.
- 🧪 Tests: 794/794 unit pass; tsc clean.
- 📁 Files: coaching.prompt.ts (behavioral rules), coaching.prompt.spec.ts (budget guard 27→27.5k).
- 🔁 Next prompts: get the onboarding repro/screenshot; decide hard-proof-gate yes/no; schedule the prompt-caching restructure for latency.
- 🧠 Reflection: ~80% of the "remaining" list was already built — the value this turn was the audit + three narrow real gaps, not a big build.

## Evaluation notes (flywheel)

- Failure modes observed: accusatory assumption on photos (Salata); generic "looks good" proof ack with no pivot.
- Graders run and results (PASS/FAIL): unit suite PASS (794/794), tsc PASS.
- Prompt variant (if applicable): coaching prompt grew to ~27.4k chars; budget guard 27.5k.
- Next experiment (smallest change to try): real-convo check that a logged proof now gets a specific critique + a next-move pivot.
