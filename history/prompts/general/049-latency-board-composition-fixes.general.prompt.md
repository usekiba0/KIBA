---
id: 049
title: Board composition, day-zero praise, and turn-latency fixes
stage: general
date: 2026-07-28
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (freeform — "merge it and do both")
labels: ["latency", "coaching", "composition", "stripe-webhook", "sendblue"]
links:
  spec: null
  ticket: null
  adr: null
  pr: "https://github.com/usekiba0/KIBA/pull/48, https://github.com/usekiba0/KIBA/pull/49"
files:
 - backend/src/onboarding/stripe-webhook.controller.ts
 - backend/src/accountability/todo.service.ts
 - backend/src/ai/prompts/coaching.prompt.ts
 - backend/src/ai/coaching.service.ts
 - backend/src/messaging/coaching.processor.ts
 - backend/tests/unit/board-composition.spec.ts
 - backend/tests/unit/interim-bubble.spec.ts
tests:
 - backend unit suite: 93 suites / 1261 tests PASS
 - 11 new tests (5 board composition, 6 interim bubble)
 - tsc --noEmit clean
---

## Prompt

merge it and do both

(preceded by: "also how to lessen the response time it takes more than 10 sec")

## Response snapshot

Merged #48 (`a2f0261`) and shipped #49 (`571f1a3`).

**Latency, measured rather than guessed.** One real prod turn: webhook→seed ~0.3s, model
generation **~4.4s**, send ~0.5s, server total ~5.2s — not the 10s reported. That reply was 424
output tokens (the board dump); at Haiku's ~100 tok/s the output tokens *are* the generation
time. So reply length is the dominant lever, and the board-dump fix in #48 is itself a latency
fix. The genuine >10s cases are TOOL turns, where each call costs another round trip.

**#48 — composition.** (1) `trial_will_end` fires 3 days BEFORE trial end; the trial is 3 days,
so it landed at signup and congratulated users for consistency they hadn't had — gated on ≥2
real elapsed days. (2) `splitPlanDayIntoItems` folded modifiers backwards only, so a narrative
opener in position 0 ("This is your easiest day") became an uncheckable todo that counted as a
weekly-review MISS — now folds forward into the first real task. (3) Left the 13-item seeding
alone (multi-goal legitimately contributes work) and fixed the *recitation* via prompt rules.
(4) Karibi's new pin-chat copy.

**#49 — latency.** Claude opens tool turns with its own line ("bet, locking that in") which we
discarded; `runChat` now takes `onInterimText` and ships it before the tools run. Text path
only. Guards: restated openers stripped including joining punctuation, reply that only repeats
the opener returns empty AND skips the forced-text retry, <12-char fragments not sent, failed
early send never breaks the turn. Bubble gap 1200ms → 700ms.

**Two of my own hypotheses were disproved during the session** and both are recorded as dead:
the raw-GitHub content-type theory for the pin GIF, and the `plan:"inbound_only"` theory. Live
SendBlue sends proved the media pipeline works (mp4 + png to a US device, text to a Pakistan
number), so the original failure was not reproducible with the current config.

## Outcome

- ✅ Impact: three real conversational bugs fixed, tool-turn latency cut from ~10s of silence to a first reply in ~2s, and 2.4s of dead bubble delay removed from multi-bubble answers
- 🧪 Tests: 1261/1261 PASS (11 new), tsc clean; a test caught a real defect (stripping left the reply starting `". done, …"`)
- 📁 Files: 7 (2 new)
- 🔁 Next prompts: read cache read:write ratio, READ LIVE REPLIES after three prompt-path changes in one day, watch for duplicate messages from #49
- 🧠 Reflection: measuring first reframed the whole task — "make it faster" turned out to be "make it say less", which a fix already in flight was solving

## Evaluation notes (flywheel)

- Failure modes observed: two confident root-cause theories (content-type, inbound_only) both wrong; only direct probing settled it. Also nearly "fixed" a CSS overflow that was a headless-screenshot artifact
- Graders run and results (PASS/FAIL): full unit suite PASS; interim-bubble behavior pinned by 6 tests including the no-callback no-op case
- Prompt variant (if applicable): coaching prompt gained board-recitation rules
- Next experiment (smallest change to try): after a day of traffic, compare `genMs` before/after the board rules to quantify how much reply length was actually costing
