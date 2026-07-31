---
id: 077
title: Bare ack must not write state or reopen a turn
stage: green
date: 2026-07-31
surface: agent
model: claude-opus-5[1m]
feature: none
branch: fix/bare-ack-no-state-writes
user: usekiba0
command: (direct request — "fix wht reported first")
labels: ["ai-guards", "reminders", "intake", "prompt-budget", "haiku", "prod-incident"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/67
files:
 - backend/src/ai/ack-guard.ts (new)
 - backend/tests/unit/ack-guard.spec.ts (new)
 - backend/src/ai/coaching.service.ts
 - backend/src/ai/prompts/intake.prompt.ts
 - backend/src/ai/prompts/coaching.prompt.ts
 - backend/tests/unit/coaching.prompt.spec.ts
tests:
 - tests/unit/ack-guard.spec.ts — 55 new cases, all green
 - Full unit suite — 105 suites / 1462 tests green
 - tsc --noEmit clean; eslint clean on changed files
 - Prod: deploy 77ea45b live 2026-07-31T07:57:57Z, /v1/health 200, fresh Nest pid 72
---

## Prompt

fix wht reported first

(Following the bubble-order fix in PHR 076. The report being actioned:
"Error here it says all this when all I said was bet : could've just said okay bet
when you sending it? Or are you ready or need more time or something casual like
that")

## Response snapshot

The user overrode my recommendation to defer this until after re-testing on the
fixed build. Proceeded with the full fix.

**Traced the actual turn in prod (user `df3b46fb`) rather than working from the
screenshot:**

```
00:37Z  "Yea so remind me in an hour at 830" -> reminder 2bbd3fd8 for 01:30Z   OK
01:30Z  reminder FIRES: "yo send those business numbers..."                    OK
01:51Z  user: "Bettt"
        -> schedule_reminder called AGAIN -> eb98e3b8 for 2026-08-01T01:30Z    BUG
        -> 196 output tokens re-litigating the clock, ending
           "wait - that fired for tomorrow."
```

The resolver was *right* to roll `20:30` forward — it had already passed at 20:51.
The scheduler, resolver and send path were all correct. The single defect: **a
one-word acknowledgement of a message that had already done its job was read as a
fresh instruction.** Everything confusing downstream followed honestly from that.

This reframed the fix. It is not a verbosity problem — it is a state-write problem
that produced verbosity as a symptom.

**`ack-guard.ts`** — deterministic, no model call, no added latency, same family as
`stripFalseReminderClaims`. `schedule_reminder` is refused when BOTH hold:
1. the inbound is nothing but acknowledgement tokens, and
2. KIBA's last message did not ask a question.

(2) is the safety valve: "bet" answering *"want me building your plan tonight?"* is
CONSENT and must still write — a load-bearing intake path. Consent words (`yes`,
`yeah`, `sure`) and `done` are kept out of the token set entirely so a missing
question mark can never swallow a real yes or a task completion.

Refusing the write leaves `reminderWritesOk` at 0, so `stripFalseReminderClaims`
strips any "locked for tomorrow" the model narrates anyway — the two guards
compose. The tool result is phrased as an instruction, not an error, because a bare
failure makes the model tell the user "the system's being weird" (a known prior bug).

**Prompt side.** Intake had *no* reply-length mirror at all — which is exactly why
this landed on the intake path and not on coaching. Coaching had one, but it
instructed the model to PUSH one-word replies: correct for "maybe"/"idk", wrong for
"bet", which is agreement.

The coaching rule landed **under** the 36,400-char ceiling rather than raising it:
+61 for the distinction, paid for by −57 compressing three rationale clauses in the
same rule. The never-reschedule half is not in the prompt at all — `ack-guard.ts`
enforces it, the same reasoning the file already records for
`stripFalseReminderClaims`.

Two self-inflicted bugs were caught by the new tests before landing: `"coool"`
collapsed to `"col"` (fixed by trying both 1-run and 2-run collapse variants), and
`"bet?"` passed as inert because `?` was stripped as punctuation (fixed by checking
the raw text for `?` first).

## Outcome

- ✅ Impact: a bare acknowledgement can no longer create a reminder or reopen a
  settled turn. Live in prod as `77ea45b`.
- 🧪 Tests: 55 new cases incl. the verbatim production message, stretched spellings,
  emoji-only, and the consent/`done`/embedded-instruction negatives. 105 suites /
  1462 tests green.
- 📁 Files: `ack-guard.ts` + spec (new); `coaching.service.ts`, both prompts,
  `coaching.prompt.spec.ts`.
- 🔁 Next prompts: client re-tests both fixes tonight. PR #66
  (`fix/bubbles-split-only-on-marked-beats`) still open and unmerged by choice.
- 🧠 Reflection: the report read as "too wordy". Pulling the actual turn showed a
  spurious state write underneath it. Fixing the verbosity alone would have left
  the wrong-day reminder on the books, silently.

## Evaluation notes (flywheel)

- Failure modes observed: (1) acknowledgement parsed as instruction; (2) intake
  prompt missing a reply-length rule the coaching prompt already had; (3) the
  coaching rule that did exist pushed back on one-worders, which is wrong for a
  positive ack.
- Graders run and results (PASS/FAIL): PASS — unit suite green, tsc clean, deploy
  `77ea45b` verified live by commit id with a fresh process and health 200.
- Prompt variant (if applicable): intake +1 rule; coaching rule amended net +4
  chars under the existing ceiling.
- Next experiment (smallest change to try): watch prod logs for
  `ack_reminder_write_suppressed` — it should fire on acks and never on a "bet"
  that answers a question.
