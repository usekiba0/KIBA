---
id: 054
title: Training Doc v2 live sim verification
stage: general
date: 2026-07-29
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (freeform request)
labels: ["training-doc-v2", "prelaunch", "sim", "verification", "identity-referendum", "guard"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/scripts/sim-trainingdoc-v2.ts (new)
 - backend/src/messaging/intake-close-guard.ts (new)
 - backend/tests/unit/intake-close-guard.spec.ts (new)
 - backend/src/messaging/coaching.processor.ts
 - backend/src/ai/prompts/intake.prompt.ts
tests:
 - backend/tests/unit/intake-close-guard.spec.ts (18 cases)
 - full unit suite — 96 suites / 1319 tests pass
 - live sim — 50/55 graded checks pass
---

## Prompt

run it

## Response snapshot

Built `scripts/sim-trainingdoc-v2.ts`, which runs Training Doc v2's own section-7 test methodology against the real model and the live prompts, then auto-grades each numbered failure mode. Five full onboardings (question / greeting / one-word / skeptical / hype openings), each with a distinct name, a deliberately mid-size city, and a real emotional disclosure — plus post-pay coaching checks for fake proof, ambiguous input, a declined config question, and a ghost-then-coded-confession.

### What the first run caught — one real defect

The identity referendum (P1.2) was STILL firing after the prompt ban: the hype persona's close ended "you ready to lock this in?". That rule had now been banned in prompt twice (Doc v1 for emotional contexts, 2026-07-29 for closes) and still shipped, so it stopped being a persuasion problem. Added `src/messaging/intake-close-guard.ts` — a deterministic strip of trailing readiness-referendum questions, wired in beside `scrubIntakeVoice` in the intake reply path. Same call this codebase already made for em-dashes, false reminder claims, fabricated time gaps and question loops.

It is deliberately narrow: strips only from the END (the tail is what they must answer), operates per `[pause]` bubble, handles stacked referendums, and is non-destructive — if removing the question would empty the message, the original ships. "you in?" is explicitly preserved: the training doc's own model-answer close ends that way. 18 unit cases, including all four instances the doc caught and the exact line this sim produced.

### Two grader bugs the run also exposed — worth recording, because both produced false failures

1. **Graded raw model output instead of post-pipeline text.** Five "em-dash" failures were reported for text users would never see: `humanizeVoice()` converts em-dashes at `send()`. Now runs replies through the real pipeline before grading — the sim measures the product, not the model.
2. **Graded a fixed turn as "the close".** The callback and the referendum both live in the CHALLENGE message, but KIBA paces the build to the person — a skeptic gets one more diagnostic beat than someone who arrived ready. Grading one fixed turn reported "closing amnesia" for conversations where the callback landed one message later (the hype close said "your brother passed in 2023 and that album was supposed to be for him. that's what we're actually fighting for" — a textbook callback, marked FAIL). Now grades the whole close window.

Also relaxed the P0.4 grader, which flagged "4 days" when KIBA was echoing the user's own "i can do 4 days if im honest" — a training frequency, not a challenge window.

### Product change from the run

P1.1 hit only 3/5 on the first honest measurement. Root cause was salience, not absence: `why_it_matters` was already in WHAT YOU KNOW but sat as one bullet among twelve. Promoted it into a dedicated `THEIR STRONGEST DISCLOSURE — SAY THIS BACK AT THE CLOSE` block, picking the first non-empty of why_it_matters / public_failure_scenario / fears / typical_failure_moment / avoidance_patterns.

### Final state — 50/55

Consistently passing across runs: fake-proof rejection (2/2, both non-fitness), no first-person hallucination, declined city never invented, coded confession engaged with no menu-retreat, 5/5 distinct name reactions, cultural mirror, no re-asking settled time, and never a wrong challenge window.

Residual: P1.1 callback is 4/5 (run-to-run variance on Haiku, not a code path); three soft "did not name the window" notes that are explicitly not defects; one ambiguous-input reply that offered a concrete option without a question mark, which the doc permits — the load-bearing assertion (no first-person hallucination) passed.

Noted but not a prod bug: the sim prints `save_intake_field(...)` as literal text because tools aren't wired in the harness; prod handles these as real tool_use blocks.

## Outcome

- ✅ Impact: doc's pre-launch test methodology executed end to end; one real defect found and fixed deterministically; close-callback rate raised by promoting the disclosure to its own block.
- 🧪 Tests: 96 suites / 1319 tests pass; tsc clean; live sim 50/55.
- 📁 Files: 2 new source/spec files, 1 new sim harness, 2 source files edited.
- 🔁 Next prompts: re-run the sim after any close-path prompt change; consider a first-payment deliverable message (doc 5.6) and the section-5 systems post-launch.
- 🧠 Reflection: the harness was wrong more often than the product was. Two of three "failure clusters" were measurement artifacts — grading pre-pipeline text, and assuming a fixed turn is the close. A grader that doesn't model the real pipeline manufactures work.

## Evaluation notes (flywheel)

- Failure modes observed: graders that skip deterministic post-processing; graders that assume fixed conversation pacing; regex duration-matching that can't tell KIBA's numbers from the user's.
- Graders run and results (PASS/FAIL): unit PASS (1319/1319); tsc PASS; live sim 50/55 with all residuals characterised.
- Prompt variant (if applicable): added STRONGEST DISCLOSURE block to intake.
- Next experiment (smallest change to try): run the sim 3x and diff the grade sheets to separate variance from regression before acting on any single failed close.
