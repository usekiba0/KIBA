---
id: 008
title: Kill anchor-question interrogation in intake
stage: green
date: 2026-06-12
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: feat/multi-goal-pipeline
user: usekiba0
command: (chat)
labels: ["intake", "onboarding", "prompt", "bugfix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/src/ai/prompts/intake.prompt.ts
tests:
  - backend/tests/unit/intake-prompt.spec.ts (9 passed)
---

## Prompt

> U say u fixed each time but its doing the same things
> [screenshot: KIBA still asks "which one's the anchor?" right after the user
> gives a goal, and earlier asks "why does it actually matter... not the surface
> answer" after the user said "bro enough questions"]

## Response

Root cause: the previous three fixes (7ee1aed, d585898, 0a068b1) all tried to
limit the anchor/why interrogation by telling KIBA to "ask once" — but the prompt
still SCRIPTED the questions, so the model dutifully asked them. The "which one's
the anchor?" line in the screenshot is verbatim from intake.prompt.ts step 2a.

Key finding: the anchor question is REDUNDANT. coaching.processor.ts:749-750
already auto-sets the daily anchor to the first goal the moment the user saves
their goals. The system has already picked one before KIBA ever asks. So the
question gathers an answer the code does not need.

Fix (intake.prompt.ts, string-only):
- Step 2a ANCHOR: changed from "ASK ONCE" to "DO NOT ASK THIS." KIBA now states
  the anchor as a passing fact ("i'll hold you to <first goal> every morning,
  the rest rides with it") and moves on. Never asks which one.
- Step 3 WHY: banned the deeper-why probing ("not the surface answer", "what
  actually changes in your life", any second pass) and told KIBA to react/give
  value before the why ever comes up — not fire it the instant a goal lands.

Tests: intake-prompt.spec.ts 9/9 green (anchor question was never asserted; the
required ANCHOR/I-SEE-YOU/MICRO-COMMITMENT tokens remain).

Deferred to user: commit + merge to master to deploy (prod tracks master).
