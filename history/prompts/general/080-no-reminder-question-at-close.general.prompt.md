---
id: 080
title: Stop bolting a reminder question onto the close
stage: green
date: 2026-07-31
surface: agent
model: claude-opus-5[1m]
feature: none
branch: fix/no-reminder-question-at-close
user: usekiba0
command: (direct request — "fix the reminder question tacked on the close")
labels: ["intake", "ai-guards", "reminders", "checkout", "thread-audit"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/69
files:
 - backend/src/ai/reminder-claim-guard.ts
 - backend/tests/unit/reminder-claim-guard.spec.ts
 - backend/src/ai/coaching.service.ts
tests:
 - tests/unit/reminder-claim-guard.spec.ts — 5 new cases
 - Full unit suite — 106 suites / 1513 tests green
 - tsc --noEmit clean
 - Prod: deploy 2363f19 live 2026-07-31T11:27:41Z, /v1/health 200
---

## Prompt

fix the reminder question tacked on the close

## Response snapshot

**The sentence was never the model's.** Grepping the literal string found it in
`reminder-claim-guard.ts:85` — `FALLBACK`, appended by `stripFalseReminderClaims`.

Confirmed against prod before writing anything: all three sightings from the
audit are `false_reminder_claim_stripped`.

```
21:04:32Z  dropped "the second it goes through i'm in your texts every morning
                    at 9am calling you before you head to lifetime."
21:07:40Z  dropped "tell them it's $9.99 a month and i'm checking in on you
                    every morning at 9am..."
00:33:44Z  dropped "that's exactly what i do — i'll be on you at 8:30 every day
                    the second you're in."
```

The close legitimately promises accountability in the abstract — "every morning
at 9am i'm on you" — without scheduling anything, correctly, because there is
nothing to schedule until they pay. That trips the promise patterns.

**The bug is an asymmetry the function's own docstring already described:** "if
stripping *empties* the reply we ask for the time." The implementation appended
`FALLBACK` unconditionally, including when other sentences survived. Fixed
narrowly: when a checkout link went out this turn AND real content survived, drop
the promise and stop. The `kept.length === 0` path is unchanged even at a close —
suppressing there ships an empty message, which is worse.

Writing the tests exposed that the pre-existing test named "replaces the whole
reply when the claim IS the whole reply" never actually exercised the empty path:
"Bible reminder." is not itself a claim, so something always survived. Used
"your reminder is set. fires in 12h 51m." instead, where every sentence trips.

**Deliberately not folded in:** the 00:33 case also re-asks for a time the user
gave one message earlier. Distinct defect — root cause is the model not calling
`schedule_reminder` — and the honest recovery is genuinely unclear, since a
silent drop risks the exact failure this guard exists to prevent. Reported, left
open.

**New finding surfaced while verifying:** the sentence stripped at 21:07:40Z
contains "tell them it's $9.99 a month". `intake.prompt.ts` explicitly forbids
quoting price at the link. It only vanished because the reminder guard happened
to strip that whole sentence for an unrelated reason, so the rule is unguarded
and will recur. Added to the open list.

## Outcome

- ✅ Impact: the checkout close no longer ends with an uninvited reminder
  question. Live as `2363f19`.
- 🧪 Tests: 5 new cases against the verbatim production close; 106 suites / 1513
  tests green; tsc clean; deploy verified live by commit id, health 200.
- 📁 Files: `reminder-claim-guard.ts`, its spec, `coaching.service.ts`.
- 🔁 Next prompts: 5 findings open — price quoted at the link (new), re-asking a
  given time, collapsed line breaks, duplicate morning check-ins, dead board.
- 🧠 Reflection: `intake.prompt.ts` has blamed the model for this since 07-21 and
  told it not to do it. The model was innocent the whole time. When a bad string
  appears verbatim across threads, grep for it before touching a prompt.

## Evaluation notes (flywheel)

- Failure modes observed: (1) a guard's remediation text shipped in a context
  where it made no sense; (2) implementation drifted from its own docstring;
  (3) a prompt rule written against a bug the prompt could not cause.
- Graders run and results (PASS/FAIL): PASS — suite green, tsc clean, deploy
  `2363f19` verified live with health 200.
- Prompt variant (if applicable): none — the prompt was never the cause, so
  nothing there was touched.
- Next experiment (smallest change to try): after the next intake close, confirm
  `false_reminder_claim_stripped` still fires but no "what time" text ships.
