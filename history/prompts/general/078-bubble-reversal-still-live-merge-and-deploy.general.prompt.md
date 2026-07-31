---
id: 078
title: Bubble reversal still live — merge PR #65 and deploy
stage: green
date: 2026-07-31
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (direct request — client screenshots of reversed bubbles)
labels: ["messaging", "sendblue", "bubble-order", "prod-incident", "render", "deploy-verification"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/65
files:
 - backend/src/messaging/coaching.processor.ts (merged via PR #65, squashed as 0ad44e5)
tests:
 - CI on PR #65 — Backend Lint + Test: SUCCESS
 - CI on PR #65 — Frontend Lint + Build: SUCCESS
 - Prod verification: Render deploy 0ad44e5 live 2026-07-31T07:28:38Z, /v1/health 200, fresh Nest pid 73
---

## Prompt

Every message is backwards users will get confused , just showing u updates from live convos but you can look into the chat and if we can get this fixed by tonight, it'll be good because I'm gonna try to get some more convos in to test asap  ---- sending more

[screenshot 1: 2-bubble intake replies delivered in reverse order]

Error here it says all this when all I said was bet : could've just said okay bet when you sending it? Or are you ready or need more time or something casual like that

[screenshot 2: multi-bubble close, reversed]
[screenshot 3: Houston reminder thread, reversed]

## Response snapshot

Diagnosed from prod data rather than from the screenshots.

**Finding: the 07-30 fix never reached production.** Two independent failures stacked:

1. PR #65 (`fix/bubble-order-remove-concurrent-sends`, `230f888`) — which deletes the
   `Promise.all` branch — was pushed and opened but **never merged**. `origin/master`
   was still at `effe544`, the commit that *added* the flag.
2. The Render env var `MESSAGE_CONCURRENT_BUBBLES` had been flipped to `false` in the
   dashboard, but **a Render env write does not restart the process**. The live process
   (pid 55, started by the 19:48Z deploy of `effe544`) still held `true`.

Net effect: for ~10 hours both the dashboard and the session memory asserted the bug
was fixed while prod kept reversing bubbles.

**Proof, from Render logs (no DB access needed).** The Houston reply at 01:51:44Z:

```
01:51:43.766          intake_reply generated (outputTokens 196, toolIterations 2)
01:51:44.205  +439ms  [SendBlue] Send response  handle=9b1cb1e6…
01:51:44.227   +22ms  [SendBlue] Send response  handle=570f440e…
```

A single SendBlue round trip is ~450ms (measured 07-30 via `send_timing`). Sequential
sends therefore land ~450ms apart. **22ms apart means both requests were in flight at
once** — the concurrent path. This timestamp-diff is now the standing cheap detector
for this class of bug.

**Action taken:** merged PR #65 (CI green, mergeable CLEAN) → squashed to `0ad44e5` on
master → Render auto-deployed `dep-d9m4ss942hec73d7m3f0` → **live 07:28:38Z**, health
200, fresh Nest pid 73. The `Promise.all` branch no longer exists in the source, so the
behaviour cannot be restored by an env flip.

**Second issue (verbose reply to "Bettt") reported, not fixed.** Deliberately held:
much of its incoherence was the reversal itself. In correct order the pair reads as
KIBA noticing the reminder landed on the wrong day and then re-checking — coherent,
merely over-long. Recommended the client re-test on the fixed build before any prompt
change, so the remaining verbosity can be measured against correct output rather than
against a scrambled transcript. Two genuine sub-issues noted for follow-up: (a) no
low-content-acknowledgement rule, so a one-word "bet" can reopen a settled question;
(b) an underlying reminder/timezone defect — KIBA said "fires in 52 min" then later
"that fired for tomorrow".

## Outcome

- ✅ Impact: P0 delivery-order bug removed from prod. Multi-bubble replies now send
  sequentially; ordering is structurally guaranteed rather than flag-dependent.
- 🧪 Tests: PR #65 CI green (104 suites / 1407 tests on the branch); prod deploy
  verified live by commit id, health 200, new process pid.
- 📁 Files: `backend/src/messaging/coaching.processor.ts`
- 🔁 Next prompts: client re-tests on the fixed build; then decide on the
  low-content-ack reply-length rule and the reminder/timezone defect. PR #66
  (`fix/bubbles-split-only-on-marked-beats`) remains open and unmerged.
- 🧠 Reflection: the previous session wrote "flag REMOVED" into durable memory on the
  strength of a pushed branch and an env flip. Neither ships code. Memory corrected.

## Evaluation notes (flywheel)

- Failure modes observed: (1) fix declared done at PR-open time rather than at
  merge+deploy time; (2) Render env write mistaken for a live config change;
  (3) durable memory recorded the intended end state, not the verified one, which
  then actively misled the follow-up session.
- Graders run and results (PASS/FAIL): PROD PASS — deploy `0ad44e5` live, sequential
  send loop confirmed in the deployed source, `/v1/health` 200.
- Prompt variant (if applicable): n/a — infrastructure/delivery fix, no prompt change.
- Next experiment (smallest change to try): on the next live 2-bubble reply, diff the
  two `[SendBlue] Send response` timestamps and confirm the gap is ~450ms, not ~20ms.
