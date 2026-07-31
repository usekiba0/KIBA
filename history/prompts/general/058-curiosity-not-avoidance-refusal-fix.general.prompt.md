---
id: 058
title: Curiosity is not avoidance — the refusal fix
stage: general
date: 2026-07-29
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (chat)
labels: ["prompt", "conversation-quality", "pre-launch", "refusal"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/ai/prompts/coaching.prompt.ts
 - backend/tests/unit/coaching.prompt.spec.ts
tests:
 - tests/unit/coaching.prompt.spec.ts — 1 new behavioural test (5 assertions)
 - full unit suite: 97 suites / 1333 tests passing
---

## Prompt

while read you may continue the pause work the other agent is stoped now

## Response snapshot

Item 5a from Karibi's pre-launch list — the last free item owed before Friday.

**The bug.** He asked "who is DDG?" and then "did he go to streamer u?". KIBA
refused both — *"i'm not answering random questions about other people. we're
here to get you moving on your own thing."* — and pushed the goal instead. Tomo
answered both properly.

**Root cause was emergent, not instructed.** Nothing in the prompt told KIBA to
refuse. It already said "answer ANY question fully" and already banned "not my
lane" style deflections. What was missing was any rule distinguishing *someone
being curious for ten seconds* from *someone avoiding their work* — so the model
improvised accountability and refused. The fix is therefore an added rule, not a
removed one.

**The constraint.** The coaching prompt sits under a hard char-budget test, at
36,278 of 36,400 — **122 chars of headroom**. The convention in that file is
compress before raising.

**What shipped.** Rather than appending a block, folded the rule into the line
that already covers the topic, replacing a vague instruction with a capped one:

- was: `broad knowledge, use it, then tie back if it fits.`
- now: `curiosity is NOT avoidance: never refuse one to keep them focused. answer
  it FIRST; if it's the third dodge in a row add ONE re-anchor line at the end,
  never a lecture.`

That is +119 chars, which did not fit. Paid for it by deleting *"everything
else, just answer"* from the LIVE-info line — made redundant by the new rule.
**Net +90; final length 36,366, 34 chars of headroom.** Budget not raised.

Sized every candidate rewrite in a script rather than by eye, after an earlier
attempt in this session overshot by 87 chars because the measuring fixture was
shorter than the spec's.

Added a behavioural test asserting all four properties (never refuse to keep
them focused, answer first, one re-anchor line, gated on a third straight dodge)
with the DDG transcript in the comment, and updated the budget note so the next
person sees 34 chars rather than the stale ~120.

## Outcome

- ✅ Impact: KIBA can no longer treat a curiosity question as a focus problem. The re-anchor is capped at one line and gated on an actual pattern.
- 🧪 Tests: 1 new test / 5 assertions; full unit suite 97 suites / 1333 tests green; `tsc` clean.
- 📁 Files: 2 modified.
- 🔁 Next prompts: reply-length tightening (the remaining half of item 1) is the last unshipped free item; the Sonnet 5 vision flip is staged awaiting `sim-vision.ts` evidence; bubble gap 700→0 awaits a decision.
- 🧠 Reflection: The rule that was missing was not "answer questions" — that was already there — but the *distinction* the model had no way to draw. Worth remembering when a prompt appears to already say the right thing.

## Evaluation notes (flywheel)

- Failure modes observed: Measured headroom with a fixture shorter than the spec's, so the first version overshot the budget by 87 chars and failed the guard.
- Graders run and results (PASS/FAIL): PASS — budget guard green with 34 chars spare.
- Prompt variant (if applicable): folded into the existing capability line rather than added as a new block, to stay under budget.
- Next experiment (smallest change to try): run the DDG exchange through `sim-coaching.ts` against the live model to confirm the rule actually changes the reply, rather than trusting the assertion that the text is present.
