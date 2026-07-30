---
id: 076
title: Split Only On Model Marked Beats
stage: general
date: 2026-07-31
surface: agent
model: claude-opus-5[1m]
feature: none
branch: fix/bubbles-split-only-on-marked-beats
user: usekiba0
command: (freeform — "you should not always sent 2 or three bubbles, only send when needed")
labels: ["messaging","bubbles","prompt","voice","client-feedback"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/messaging/bubbles.ts
 - backend/src/ai/prompts/coaching.prompt.ts
 - backend/src/ai/prompts/intake.prompt.ts
 - backend/tests/unit/bubbles.spec.ts
tests:
 - npx tsc --noEmit -p tsconfig.json (clean)
 - npx jest tests/unit (104 suites / 1411 tests passed)
---

## Prompt

> i would say you should not always sent 2 or three bubbles, only send when needed.
> and whn you do make sure the reply is connected and if you cant then keep it one

## Response snapshot

Follow-up to the bubble-order reversal (PHR 075). With ordering fixed, the residual
complaint in `KIBA_Message_Feedback_Developer_Detailed.pdf` — bubbles that "feel
like two different AI responses to the same prompt" — still had a real cause:
**KIBA was splitting nearly every reply, not just the two-beat ones.**

`autoSplit` had a fallback that cut any reply over 80 chars at its first sentence
boundary. Almost nothing KIBA says is under 80 chars, so "2 bubbles when there are
2 beats" was in practice "2 bubbles always" — including on replies that are one
continuous thought. Cutting continuous prose in half produces two texts that do not
follow from each other, which is exactly the disconnected feel the client described.

Change: the only automatic split left is the model's **own** blank line, which was
measured on 2026-07-30 to land in exactly the places a person would send a second
text. `[pause]` remains the explicit override (max 4). One paragraph is now one
text. Removed `firstSentenceBreak`, `AUTO_SPLIT_MIN_CHARS` and `AUTO_SPLIT_MIN_PART`.

Carried forward deliberately: the degenerate self-repeat guard (Karibi 2026-07-08)
used to be caught for free — the sentence split cut the repeat into two identical
bubbles and `dedupeBubbles` dropped one. With no automatic split there is nothing to
dedupe, so `collapseSelfRepeat` now finds a doubled reply in the text itself.

Prompt side, both surfaces: each bubble must CONTINUE the one before it and never
re-answer what was just answered; if it can't continue, send one text. The coaching
line was rewritten 7 chars SHORTER than the one it replaced — that prompt has a
36,400-char ceiling test with 15 chars of headroom, so the rule had to pay for
itself. Dropped the "(reaction, then take, then question)" enumeration, which was
redundant with the worked example on the same line and arguably encouraged the
3-beat splitting this change is meant to stop.

## Outcome

- ✅ Impact: KIBA splits only where the model marked a beat; every other reply ships
  as one text. Directly addresses rules 1, 2, 4 and 5 of the client feedback doc.
- 🧪 Tests: tsc clean; 104 suites / 1411 unit tests green (4 new bubble cases; 3 old
  cases rewritten because they encoded the always-split behaviour).
- 📁 Files: `bubbles.ts`, `coaching.prompt.ts`, `intake.prompt.ts`, `bubbles.spec.ts`.
- 🔁 Next prompts: send the client the note explaining the delivery bug; decide rule
  3 (a third Action bubble) against the #62 latency cap.
- 🧠 Reflection: the reversal masked a second, independent defect. Fixing delivery
  order alone would have left KIBA still splitting every reply — the client would
  have re-reported it and been right both times.

## Evaluation notes (flywheel)

- Failure modes observed: a code fallback written to enforce a prompt rule
  ("2 bubbles is the norm") overshot into applying it unconditionally, because its
  trigger (80 chars) was far below the typical reply length. A threshold that fires
  on ~100% of inputs is not a heuristic.
- Graders run and results (PASS/FAIL): unit suite PASS; tsc PASS; coaching prompt
  ceiling PASS with headroom improved 15 → 22 chars.
- Prompt variant (if applicable): BURSTS rule, coaching + intake.
- Next experiment (smallest change to try): measure the new bubble rate in prod over
  a day — expect a large drop from the near-100% split rate, and confirm the blank
  line still fires on genuine two-beat replies rather than collapsing everything.
