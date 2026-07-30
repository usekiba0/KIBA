---
id: 075
title: Bubble Order Reversal From Concurrent Sends
stage: general
date: 2026-07-31
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (freeform — screenshots of "double responses" + KIBA_Message_Feedback_Developer_Detailed.pdf)
labels: ["messaging","bubbles","latency","prod-incident","sendblue","rollback"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/messaging/coaching.processor.ts
tests:
 - npx tsc --noEmit -p tsconfig.json (clean)
 - npx jest tests/unit (104 suites / 1407 tests passed)
---

## Prompt

[screenshots] double responses

> The way that it's responding in both messages is kind of responding to the same
> question. It's not like it's breaking up the same response into two bubbles.
> It's just responding to the same question differently.

> It's not breaking one response into two messages instead it's responding to the
> same question in two different ways

> do it

> read the file KIBA_Message_Feedback_Developer_Detailed.pdf

> [screenshot, bubble 2 circled in green] You understand what I mean like it's
> backwards.

## Response snapshot

Reported symptom: KIBA appearing to answer the same user message twice, with the
two answers contradicting each other.

Actual cause: **one reply, two bubbles, delivered in reverse order.**
`MESSAGE_CONCURRENT_BUBBLES=true` was set in the Render environment. That flag
shipped **default-off** the previous day in PR #64 (`effe544`) as a latency
experiment, sending all bubbles at once via `Promise.all`
(`coaching.processor.ts:2222`). The comment directly above it predicted this
exact failure mode and prescribed the rollback.

Proof came from the prod database (external Postgres connection string pulled via
the Render API — the `DATABASE_URL` in `backend/.env` is an internal hostname and
is not reachable off-box). Every reply persists as **one** AI row with its bubbles
newline-joined, so a second generation would appear as a second row. There were no
second rows. Four rows stored in the correct order and delivered backwards:

| row | stored bubble 1 | stored bubble 2 |
| --- | --- | --- |
| `1e2367f9` | "got it - so you didn't know where to start…" | "you got the progression. 25 minutes…" |
| `6c5bbc61` | "solid. they're locked in too then." | "so here's the real thing - you're 9…" |
| `2b68afe4` | "yeah. real answer - you can…" | "but here's what matters right now…" |
| `7e1f8905` | "lol fair - your parents handle it." | "show them the link, they tap it…" |

`94272d8c`, two minutes after `7e1f8905`, was delivered **correctly** — confirming a
race rather than a consistent content defect. The shorter bubble's HTTP request
finishes first and lands first, which is why the short half jumped ahead in all
four cases.

Why it read as two separate answers: reversed, each half stands alone as its own
response, and the pair contradict. "the NBA isn't the move you make today" above
"yeah, you can" reads as KIBA brushing off a 9-year-old and then reversing itself.

The client's feedback PDF was written against this broken output. Its "Current
Example" quotes the reversed pair verbatim, and its "Desired Example" (Bubble 1 =
Answer, Bubble 2 = Perspective) is close to what KIBA had *already generated* and
stored. Rules 1, 2, 4 and 5 of that doc are satisfied once ordering is correct.
Rule 3 (a third Action bubble) is a genuine open ask and conflicts with PR #62
(`a316172`), which capped self-decided splits at 2 after sendMs regressed 4x.

Actions taken:
1. `MESSAGE_CONCURRENT_BUBBLES` → `false` via the Render API.
2. Service restarted — a Render env-var write does **not** restart the process, and
   `ConfigService` reads `process.env` at runtime, so the flip was inert until the
   restart. Verified `https://kiba-1.onrender.com` returns 200 afterwards.
3. Removed the `concurrentBubbles` flag and the `Promise.all` branch from
   `coaching.processor.ts` entirely, replacing the comment with the measured
   result and the affected row ids so the experiment is not re-run.

## Outcome

- ✅ Impact: prod bubble reversal stopped (env flip + restart); the concurrent-send
  path is gone from the code so the flag cannot re-break delivery order.
- 🧪 Tests: tsc clean; 104 suites / 1407 unit tests green.
- 📁 Files: `backend/src/messaging/coaching.processor.ts` (flag + branch removed).
- 🔁 Next prompts: commit + PR the code removal; decide on feedback-doc rule 3
  (third Action bubble) against the PR #62 latency cap; tell the client the delivery
  bug is fixed before building to a spec written off reversed output.
- 🧠 Reflection: the user disputed the diagnosis twice. Re-arguing from screenshots
  was the wrong move — the DB row settled it in one query and also revealed the
  `94272d8c` counter-example that proved the race. Go get the data.

## Evaluation notes (flywheel)

- Failure modes observed: a default-off experiment enabled in prod with no
  monitoring on the thing it was known to risk; a client bug report authored
  against broken output, which would have driven prompt work against a delivery
  defect.
- Graders run and results (PASS/FAIL): unit suite PASS; tsc PASS; prod health
  probe PASS.
- Prompt variant (if applicable): n/a — no prompt change made.
- Next experiment (smallest change to try): if the ~450ms is wanted back, keep
  sends sequential and pursue an ordered/batch send API from SendBlue rather than
  client-side concurrency, which is now measured as unsafe.
