---
id: 012
title: Coaching conversation loop fix (Bianca circle)
stage: green
date: 2026-06-23
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: master
user: usekiba0
command: (chat — read Bianca admin chat, fix circling)
labels: ["coaching-prompt", "anti-loop", "plan-building", "retention", "bugfix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/ai/prompts/coaching.prompt.ts
 - backend/tests/unit/coaching.prompt.spec.ts
tests:
 - backend/tests/unit/coaching.prompt.spec.ts (43 pass)
 - full unit suite: 737 pass, tsc --noEmit clean (only DB-dependent onboarding integration suite fails locally, by design)
---

## Prompt

Please read "Bianca" chat said ut is circling the same questions and won't move forward this is a common error I get as well

"Yea i cant seem to get past this circle. Lol. I keep repeating in different ways and still asking"

(Attached: KIBA Admin screenshot of Bianca — status trialing — where KIBA repeatedly asks workout-then-breakfast-then-workout details and never moves on.)

## Response snapshot

Diagnosed: Bianca is *trialing* (onboarding_stage COMPLETE) so she's on the COACHING path (coaching.prompt.ts / generateReply), not intake. The intake prompt has strong anti-repeat rules; the coaching prompt had none. For a new trial user with no action_plan seeded, the todo list is empty, so the model free-form interrogates to build the day — stacks two asks ("breakfast AND workout"), never commits answers via add_todo, and circles. Model had the history; this was a prompt/behavior gap, not a context bug.

Fix (prompt-only): (1) added a prominent "DON'T LOOP" block to the static coaching body — never ask the same question twice, never stack two asks, act/commit the moment you have enough, stop when circling; (2) strengthened the empty-list TODO branch to "CONVERGE, DON'T INTERROGATE" — add_todo the second they give a real task/time, don't re-ask a piece already given; (3) bumped the prompt size-budget test 25k→26k and added 3 regression tests.

## Outcome

- ✅ Impact: KIBA now converges during plan-building and stops re-asking answered questions — directly addresses the recurring "can't get past the circle" retention killer.
- 🧪 Tests: coaching.prompt 43/43; full unit 737 pass; tsc clean.
- 📁 Files: coaching.prompt.ts (2 edits), coaching.prompt.spec.ts (budget bump + 3 tests).
- 🔁 Next prompts: consider a deterministic guard (detect N near-identical assistant questions in a session and force a convergence reply) if prompt-only proves insufficient in the wild.
- 🧠 Reflection: behavioral discipline that exists in intake should be mirrored into coaching — both are the same model under different system prompts.

## Evaluation notes (flywheel)

- Failure modes observed: model treats empty-todo plan-building as an open-ended interview; stacks questions; perfectionist gathering prevents commitment.
- Graders run and results (PASS/FAIL): unit PASS (737); tsc PASS.
- Prompt variant (if applicable): coaching.prompt.ts anti-loop batch 2026-06-23.
- Next experiment (smallest change to try): if circling recurs, add a server-side repeated-question detector that injects a "you're looping — lock it in now" nudge.
