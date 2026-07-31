---
id: 059
title: Reply-length tightening + live search folded into Phase 2
stage: general
date: 2026-07-29
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (chat)
labels: ["prompt", "latency", "pre-launch", "proposal", "pricing"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/ai/prompts/coaching.prompt.ts
 - backend/tests/unit/coaching.prompt.spec.ts
 - phase 2/new plaanning/make_full_proposal_doc.py
tests:
 - tests/unit/coaching.prompt.spec.ts — 1 new test (4 assertions)
 - full unit suite: 97 suites / 1334 tests passing; tsc clean
---

## Prompt

ok but befire that tell me whay did we skipper the websearch module from proposal

(then) 2

(then, mid-turn) Reply-length is the only unshipped one ... ---> yes do it now

## Response snapshot

**Why web search was missing.** Not dropped — it sat in the pre-launch answers
doc under "post-launch improvements", quoted at $1,600 alongside the USDA
nutrition lookup at $2,200. The reasoning was that both improve the product
already live rather than building a new surface, and nothing in Phase 2 depends
on them. The flaw: the proposal opens by claiming it covers "everything left to
build", which made two requested-and-priced items look deleted. User chose to
fold search into Phase 2 proper.

Added **Track H — Live information, $1,600, one step**, in Phase 2. Assert
updated $70,500 → $72,100 with the reason in a comment. The nutrition lookup is
now named explicitly in the closing section at its existing $2,200 rather than
being invisible. Regeneration is pending — the .docx is open in Word.

**Reply-length tightening** (the other half of item 1). Measured 07-28:
generation time tracks reply length almost exactly, so with the queue delays
already at zero this is the only remaining latency lever.

The prompt already said "1-2 short sentences" but had no ceiling on the *whole*
reply and permitted up to 4 bubbles. Two changes, both inside the char budget:

- **A hard cap:** `the WHOLE reply stays under 60 words unless they asked for a
  plan or a list` (+63). The carve-out matters — a workout plan is the one case
  where length is the point.
- **Bubble ceiling 4 → 3** and the BURSTS rule compressed (−44): dropped "short
  bursts" as redundant with the rule it sits next to, and dropped "or a plan with
  steps" now that the cap handles plans. Each removed bubble is both fewer tokens
  and one fewer 700ms gap.

Net **+19 chars**, budget not raised. Headroom now **15 chars** — effectively
none, and the spec comment says so.

Left the code-level `splitBubbles` cap at 4 deliberately: it is a safety net that
should only fire when the model violates the prompt rule, so it belongs looser
than the rule rather than equal to it.

## Outcome

- ✅ Impact: All five pre-launch free items are now shipped. Replies are capped at 60 words with a plan exception, and at 3 bubbles rather than 4.
- 🧪 Tests: 1 new test / 4 assertions; 97 suites / 1334 tests green; tsc clean.
- 📁 Files: 2 source/test files; 1 proposal generator (regeneration blocked on a Word file lock).
- 🔁 Next prompts: regenerate the proposal, step plan and build order to $72,100 once the files are closed; the step plan and build order still assert $70,500 and will fail loudly until updated — which is the guard working.
- 🧠 Reflection: "Why was X skipped" was worth answering honestly rather than defending the categorisation. The classification was defensible; the document's own opening sentence was what made it wrong.

## Evaluation notes (flywheel)

- Failure modes observed: A document claiming completeness while a separately-quoted item sat outside it. The bucket was right; the framing was not.
- Graders run and results (PASS/FAIL): PASS — budget guard green at 15 chars spare.
- Prompt variant (if applicable): paid for the length cap by compressing the adjacent BURSTS rule rather than raising the ceiling.
- Next experiment (smallest change to try): run a few real turns through `sim-coaching.ts` and measure token counts before/after, to confirm the 60-word cap actually moves generated length rather than just appearing in the prompt.
