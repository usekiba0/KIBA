---
id: 079
title: No checkout link for a self-declared minor
stage: green
date: 2026-07-31
surface: agent
model: claude-opus-5[1m]
feature: none
branch: fix/no-checkout-link-for-minors
user: usekiba0
command: (direct request — "pull all the convos" then "do it")
labels: ["compliance", "coppa", "payments", "intake", "ai-guards", "thread-audit"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/68
files:
 - backend/src/ai/age-guard.ts (new)
 - backend/tests/unit/age-guard.spec.ts (new)
 - backend/src/ai/coaching.service.ts
 - backend/src/ai/ack-guard.ts
tests:
 - tests/unit/age-guard.spec.ts — 42 cases, all green
 - Full unit suite — 106 suites / 1508 tests green
 - tsc --noEmit clean
 - Prod: deploy 8517211 live 2026-07-31T11:04Z, /v1/health 200
---

## Prompt

pull all the convos

(then, after the audit was reported:)

do it

## Response snapshot

Pulled all three active threads (291 messages, 40h) with the `dump-thread.js`
tool built earlier in the session, reported the findings, and the founder chose
the highest-priority item.

**The finding.** On the test phone, 2026-07-30:

```
15:47Z  user: "I'm 5"6 and 9 years old I play PG"
15:48Z  KIBA challenged a bogus height; user re-confirmed "9"
21:03Z  KIBA: "bet. tap this and we start tonight:" + Stripe checkout link
21:07Z  user: "I'm only nine I don't have money"
21:07Z  KIBA: "lol fair - your parents handle it. show them the link,
               they tap it, and you're good."
```

Client role-play, not a real child — but nothing in the product stopped it. There
is no age gate anywhere, and `coaching.prompt.ts` records "We never collect age",
so the only signal is what a user volunteers.

**The fix.** `age-guard.ts` blocks `send_payment_link` when a first-person age
under 18 appears anywhere on the user side of the thread. Whole history in scope:
the real gap was five hours between the declaration and the close.

Two properties the detector had to have, both tested:
- **No false positives.** `i'm 5'9`, `im 9 lbs down`, `remind me at 830`,
  `560k mrr`, `been lifting 9 years` all appear in real threads, and a false
  positive silently blocks a *paying adult's* checkout. Every pattern requires an
  explicit age marker ("years old", "yo") or the word "only" — a bare `i'm 9` is
  deliberately not enough.
- **Third-party ages ignored.** "my son is 9 years old" from a paying parent must
  not block that parent's own checkout.

**The tool block alone was insufficient**, caught by reading the interim-send path
rather than by a test: text emitted alongside a tool call ships BEFORE the tools
run, and in the audited thread the preamble went out 919ms ahead of the URL.
Blocking only the tool would have left "bet. tap this and we start tonight:"
dangling with no link — worse than either outcome alone. The interim send is now
suppressed on that turn.

**Scope held deliberately to the sale.** KIBA keeps coaching them; the 9-year-old
was getting a genuinely good shooting progression. Whether an under-13 should hold
a thread at all is a COPPA data-collection question flagged to the founder, not
settled in a guard.

Also widened `ack-guard`'s punctuation class to the curly apostrophe — iMessage
substitutes it and every real thread is full of it. The same omission made the age
detector miss "I'm only nine" on its first run.

## Outcome

- ✅ Impact: a self-declared minor can no longer be sent a checkout link, and the
  "get your parents to tap it" workaround is explicitly closed. Live as `8517211`.
- 🧪 Tests: 42 new cases; 106 suites / 1508 tests green; tsc clean; deploy
  verified live by commit id with health 200.
- 📁 Files: `age-guard.ts` + spec (new); `coaching.service.ts`, `ack-guard.ts`.
- 🔁 Next prompts: four audit findings still open — the close still tacking on
  "what time do you want that reminder?", collapsed line breaks in long meal
  replies (may be fixed by #66, unverified), duplicate morning check-ins, and the
  dead board. Plus the COPPA data-collection decision.
- 🧠 Reflection: the audit was only possible because the thread-dump tool existed;
  the finding is not visible in any single screenshot, only in the arc from
  intake to close.

## Evaluation notes (flywheel)

- Failure modes observed: (1) no age gate at all on a paid product; (2) the model
  routing around a refusal by delegating payment to a parent; (3) interim text
  shipping ahead of a tool it depends on.
- Graders run and results (PASS/FAIL): PASS — suite green, tsc clean, deploy
  `8517211` verified live with health 200.
- Prompt variant (if applicable): none — deliberately code-only. Prod runs
  claude-haiku-4-5 where prompt rules are soft, and this one must not be soft.
- Next experiment (smallest change to try): watch `payment_link_blocked_minor` in
  Render logs; it should fire on a declared minor and never on an adult thread.
