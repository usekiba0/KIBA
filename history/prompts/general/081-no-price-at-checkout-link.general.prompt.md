---
id: 081
title: Never volunteer a price at the checkout link
stage: green
date: 2026-07-31
surface: agent
model: claude-opus-5[1m]
feature: none
branch: fix/no-price-at-checkout-link
user: usekiba0
command: (direct request — "fix the price quoted at the link")
labels: ["intake", "ai-guards", "pricing", "checkout", "thread-audit"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/70
files:
 - backend/src/ai/price-guard.ts (new)
 - backend/tests/unit/price-guard.spec.ts (new)
 - backend/src/ai/coaching.service.ts
tests:
 - tests/unit/price-guard.spec.ts — 40 cases, all green
 - Full unit suite — 107 suites / 1556 tests green
 - tsc --noEmit clean
 - Prod: deploy b72d1ce live 2026-07-31T12:26:43Z, /v1/health 200
---

## Prompt

fix the price quoted at the link

## Response snapshot

**The finding.** 2026-07-30T21:07:40Z, to a self-declared 9-year-old, one message
after the checkout link:

> tell them it's $9.99 a month and i'm checking in on you every morning at 9am to
> make sure you hit that shooting progression at lifetime.

It never reached the user — but only by accident. The reminder guard happened to
strip that whole sentence for an unrelated reason (the "every morning at 9am"
promise). Remove the coincidence and the price ships. **Two guards masking each
other is not coverage.**

`intake.prompt.ts` step 8 forbids this explicitly and explains why: naming a
number at the moment of commitment makes people think about cancelling. Prod runs
claude-haiku-4-5 where prompt rules are soft.

**What shaped the design.** Reading further in the same prompt found the opposite
rule: on a direct "how much is it", "this is the ONE time you name it — answer
honestly and lightly". Dodging a money question is its own documented bug in this
product. So this is deliberately not a blanket strip — the guard stands down
entirely when the user asked, and `userAskedAboutPrice` is broad on purpose,
because a false positive merely lets an answer through while a false negative
makes KIBA evasive.

**Both paths.** The preamble ships ~919ms ahead of the link (measured in the
audited thread), so guarding only the final reply would let a price quoted in the
preamble through untouched. Same lesson as the minor-checkout guard in #68.

**A real defect the first test run caught.** A colon is not a sentence terminator,
so "tap this and we start tonight:" and the price clause after it were ONE
sentence — stripping the price deleted the call to action, leaving "bet. three
days you run the progression." The splitter now treats a colon followed by
whitespace as a boundary, which keeps clock times like "8:30" whole. Both are
locked in by tests. Note this differs deliberately from `reminder-claim-guard`'s
splitter, which was left alone.

**False-positive discipline.** Patterns anchor on currency or an explicit rate,
never a bare number — the close is full of bare numbers ("3 days", "5 days a
week", "every morning at 9am", "25 minutes") and a false positive silently deletes
real close copy. All are negative test cases.

Also caught a verification slip of my own: the first deploy poll matched `live` on
the *previous* commit and reported success. Re-polled against `origin/master`'s
actual SHA to confirm `b72d1ce` was the running build.

## Outcome

- ✅ Impact: KIBA can no longer volunteer a price, "free trial" or "cancel
  anytime" on a turn that sends a checkout link — while still answering a direct
  price question. Live as `b72d1ce`.
- 🧪 Tests: 40 new cases; 107 suites / 1556 tests green; tsc clean; deploy
  verified live by matching commit SHA, health 200.
- 📁 Files: `price-guard.ts` + spec (new); `coaching.service.ts`.
- 🔁 Next prompts: 4 findings open — re-asking a given time, collapsed line
  breaks (may be fixed by #66, unverified), duplicate morning check-ins, dead
  board. Plus COPPA and the crisis-detection call.
- 🧠 Reflection: the bug was invisible in the transcript because another guard
  was accidentally covering it. Worth checking whether any other prompt-only rule
  is "passing" for the same reason.

## Evaluation notes (flywheel)

- Failure modes observed: (1) a prompt-only commercial rule with no enforcement;
  (2) one guard masking another's gap, so the transcript looked clean;
  (3) sentence splitting that fused a CTA to the clause being deleted.
- Graders run and results (PASS/FAIL): PASS — suite green, tsc clean, deploy
  `b72d1ce` confirmed live by SHA with health 200.
- Prompt variant (if applicable): none — the rule already existed in the prompt
  and was ignored; this makes it code.
- Next experiment (smallest change to try): watch
  `price_quoted_at_checkout_stripped` in Render logs, and confirm it never fires
  on a turn where the user asked about price.
