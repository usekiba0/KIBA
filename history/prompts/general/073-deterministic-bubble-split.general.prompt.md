---
id: 073
title: Deterministic multi-bubble texting
stage: general
date: 2026-07-30
surface: agent
model: claude-opus-5[1m]
feature: none
branch: perf/deterministic-bubble-split
user: usekiba0
command: (freeform)
labels: ["voice", "bubbles", "haiku-compliance", "measurement"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/src/messaging/bubbles.ts
  - backend/tests/unit/bubbles.spec.ts
  - history/prompts/general/073-deterministic-bubble-split.general.prompt.md
tests:
  - "npx jest tests/unit/bubbles.spec.ts — 19 passed (10 new)"
  - "npx jest tests/unit/ — 104 suites / 1401 tests, all passing"
  - "npx tsc --noEmit — clean"
---

## Prompt

also i see that you send all response in one msgs however humans tend to break long
msgs in to multi text. see the tomo video i shared previously it does the same too

## Response snapshot

### The observation was right, and it measures brutally

`reply_sent` logs a bubble count on every turn. 151 replies over 7 days:

| Bubbles | Count | Share |
|---|---|---|
| **1** | **150** | **99.3%** |
| 2 | 1 | 0.7% |

The coaching prompt says *"2 bubbles is the norm, 3 is the ceiling"*. Reality is one
bubble essentially always — a shipped feature firing 1 time in 151.

### Root cause

`splitBubbles()` split **only** on a literal `[pause]` marker the model has to write
itself (`bubbles.ts:25`). haiku-4-5 almost never writes it. Same failure mode as the
reply-length carve-out fixed hours earlier in PR #60, and the same fix:
**move the behaviour into code, keep the prompt marker as an explicit override.**

### What was built

`autoSplit()` — when there is no `[pause]`, split into "first beat, then the rest",
**2 bubbles max**. Every guard is a case where splitting reads worse:

- `< 80 chars` → one beat, one text.
- Contains a list line (`- `) → a plan is one structure; don't strand the intro.
- Contains a URL → never separate a checkout link from its explaining sentence.
- `...` / `?!` → trailing off is one beat (the prompt explicitly allows it).
- Abbreviations (`a.m.`, `e.g.`) → detected via a dot inside the preceding token.
- Either half `< 12 chars` → no orphaned fragments.

Verified it actually **fires** — a fallback that never triggers is the same bug as
the marker it replaces. On 8 realistic replies it split 4, all at the natural beat:

```
2 | [damn that's rough, sorry to hear it.] [you still got the workout in tho, or we pushing it to tomorrow?]
2 | [i hear you on the work thing being crazy right now.] [still doesn't change what you told me on sunday tho]
1 | [nah. you said 6am and it's 9. what happened?]          (short — correctly left alone)
1 | [proof in ✓ "gym session" logged. score updated 💪]     (short — correctly left alone)
```

### Better signal found after the first pass: the model's own blank line

While answering an unrelated question (Karibi asking why KIBA can't web-search) I
ran four questions through the real prompt and the live model — and haiku separated
its beats with a **blank line every single time**, in exactly the places a person
would send a second text:

```
40. born in '84.
⏎
why, what's the connection?
```

So `\n\n` is the model's *intent*, not a guess at it — strictly better than the
sentence heuristic, and it catches every break on a three-beat reply where a
first-sentence split only ever gets the first. Verified `humanizeVoice()` does not
collapse it (`[ \t]{2,}` is space/tab only) before relying on it.

Order is now: `[pause]` → blank line → first-sentence fallback. The URL guard was
moved **above** the blank-line split, since a checkout link in its own paragraph
would otherwise ship as a standalone bubble that can fail independently.

End-to-end on real model output (`humanizeVoice` → `splitBubbles`): **4 of 5 replies
split**, vs 1 in 151 in prod. Including the prompt's own big-win pattern, which had
never once shipped as designed:

```
Q: i hit a new squat PR today
   bubble 1: WAIT.
   bubble 2: what's the number. and proof.
```

### Latency trade, stated plainly

The first bubble goes out at **exactly the same moment** it does today — the guard
chain still requires the complete reply before anything sends, so nothing gets
slower to start. The reply *finishes* landing ~600-750 ms later (one extra send plus
`MESSAGE_BUBBLE_DELAY_MS`). Affordable now that PR #60 capped reply length, and it
is the same trade Tomo makes.

### Scope note

`splitBubbles` has a single call site (`saveAndSend`), so this applies to intake and
vision replies too, not just coaching. Checked before shipping: the crisis holding
message bypasses `saveAndSend` entirely (`coaching.processor.ts:456` calls
`messagingService.send()` directly), so a safety message can never be split — and
the URL guard protects the intake checkout link.

## Outcome

- ✅ Impact: multi-bubble texting goes from 0.7% to actually working; KIBA's rhythm
  matches the Tomo reference the client pointed at.
- 🧪 Tests: 10 new specs; full suite 104/1401 green; tsc clean.
- 📁 Files: `bubbles.ts`, `bubbles.spec.ts`.
- 🔁 Next prompts: re-read `reply_sent` in a week and confirm the multi-bubble share
  moved off 0.7%; consider firing `sendTypingIndicator()` BETWEEN bubbles (Tomo does
  — we only fire once, before the first).
- 🧠 Reflection: third prompt-only guard this session found not holding on haiku
  (reply length, bubble count, and earlier the un-agreed board). The pattern is now
  strong enough to treat as a rule: **if a prompt rule matters, assert it in code and
  measure it in prod.**

## Evaluation notes (flywheel)

- Failure modes observed: a shipped, documented, prompt-driven feature that was
  silently dead in production for months — invisible because nothing asserted it and
  nobody read `reply_sent`. The client noticed before the telemetry did.
- Graders run and results (PASS/FAIL): unit suite PASS (1401/1401)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): pull `reply_sent` in 7 days; if the
  multi-bubble share is still under ~30%, the 80-char threshold is too high — lower
  it before adding any more rules.
