---
id: 064
title: Safety, compliance and retention audit
stage: general
date: 2026-07-29
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (chat)
labels: ["prod-audit", "compliance", "safety", "retention", "pre-launch", "stripe"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/58
files:
 - backend/src/safety/safety.processor.ts
 - backend/src/messaging/messaging.service.ts
 - backend/src/ai/prompts/recap.prompt.ts
 - backend/src/ai/prompts/coaching.prompt.ts
 - backend/src/accountability/recap.service.ts
 - backend/src/accountability/weekly-review.service.ts
 - backend/src/messaging/coaching.processor.ts
 - backend/tests/unit/safety-coach-alert.spec.ts (new)
 - backend/tests/unit/sendblue-opt-out.spec.ts (new)
 - backend/tests/unit/recap-silence.spec.ts (new)
 - backend/tests/unit/board-agreed-marker.spec.ts (new)
tests:
 - 4 new suites, 32 new tests
 - full unit suite: 103 suites / 1386 tests passing; tsc --noEmit clean
---

## Prompt

(continuation of the same working session — merge/deploy requests, the STOP test,
"check all the chat and see for possible issue", and a forwarded Stripe webhook-failure
email)

## Response snapshot

Five PRs merged and deployed live: #55 `2ec5f82`, #56 `2ba08e6`, #57 `36ce3b1`,
#58 `bff9162` (plus #53/#54 earlier — see PHR 061/062).

### Prod env audit — two placeholders in the SAFETY config
`CRISIS_COACH_ALERT_PHONE` was `+15550009999` (a fake 555 number) and
`CRISIS_COACH_ALERT_EMAIL` was `coach@kiba.ai` — a live site we do NOT own. So the only
working crisis channel pointed nowhere, and once SMTP started working the alert — which
carries the user's name, phone and the triggering message — would have gone to a
stranger's mail server. Both corrected by the founder to real destinations.

`APP_BASE_URL = https://kiba-1.onrender.com` is CORRECT and must not be "fixed" to the
apex domain: Twilio webhook signature validation reconstructs the request URL from it.

SMTP was half-configured (only `SMTP_PASS`, a 16-char Google App Password). Now
smtp.gmail.com / usekiba@gmail.com / `KIBA Alerts <alerts@usekiba.ai>`, and I verified
the credentials authenticate (`transporter.verify()` → OK) rather than assuming.

### #55 — crisis email leg could kill the whole alert
`sendEmailAlert` was awaited un-guarded BEFORE the `coach_alerted` update, so a throw
skipped the DB update and the SLA log, and Bull's `attempts: 3` re-ran the handler —
re-texting the coach each retry while the admin Crisis tab still showed it unhandled.
Now skipped-with-warn when SMTP is unset, try/caught when it isn't, alert marked either way.

### #56 — SendBlue opt-out was routed around via Twilio (found by running the STOP test)
Real STOP over iMessage; SendBlue declined the confirmation with
`{"error_code":402,"error_message":"OPTED_OUT","error_reason":"SpamRule"}`. `send()`
treated it as a transport failure and retried over Twilio — delivering from a DIFFERENT
number seconds after the user asked us to stop. Harmless for the confirmation itself
(carriers require it) but the fallback was unconditional. Now reconciled into our DB
(mirroring the Twilio 21610 path from #51) and suppressed unless `allowOptedOut`.
STOP/START/silence otherwise behaved correctly end to end.

### #58 — BOTH retention features had been dark for two weeks
Night recap last sent 2026-07-14; weekly review last sent 07-19. Not the cron —
`last_weekly_review_date` was stamped 07-26, so the job fired and only the copy was
missing, through `if (done && missed && proof === 0) return null` in both builders.
Bianca's week 07-20..07-26: **todos 87, committed 0, done 0, proofs 0**. All three
counters are structurally zero because nothing stamps `committed_at` (9 of 414 all-time)
and she logs meals as text. Third time this gate has killed the feature. Now gated on
whether the user ENGAGED, with copy that claims nothing about an empty ledger.

Also: the coaching board reached the model as a flat list, so on 07-28 KIBA told Bianca
"you set 3pm snack time yourself last week… why the flip now", she denied it correctly,
and KIBA then claimed "that came from the plan we built together" — both false. Lines are
now marked `[AGREED]`/`[SUGGESTED]` with rules naming those exact phrases as banned.

### Proof pipeline is nearly dead (investigated, NOT fixed)
`is_proof_submission` is declared in the entity + migration + admin API and **written
nowhere** — false for all 1,477 messages ever. `proofCount` actually reads the `proofs`
table, which holds **1 row ever** (2026-07-03) against **104 inbound media messages**.
`daily_tasks`: 52 missed, 24 pending, **0 completed, ever**. This is why every weekly
review prints `score: 0/100`. Needs a proper trace of the photo turn — deliberately not
guessed at on launch eve. Two product decisions drafted for Karibi (does a text meal log
count as proof; should the score be visible while it reads 0).

### Stripe webhook email — test mode only, live is PROVEN
Failures are test-mode events signed with the test secret hitting a server holding the
LIVE `whsec_` → 400. Our logs show 400s at 07-24 15:24/16:23 UTC matching Stripe's
"first failure 4:24 PM UTC". The LIVE path is verified with real money on 07-27 22:34:
`invoice.payment_succeeded` → `customer.subscription.created` →
`checkout.session.completed` → `sms_onboarding_complete` → trial_ending SMS. The sub was
cancelled 10 min later and the account deleted, which is why no DB row remains.
Fix: delete the test-mode endpoint in Stripe (cosmetic — it auto-stops 2026-08-02).

### Also
GitHub push protection blocked a push because the A2P session's local commits carried a
live Twilio **Account SID** in a PHR. Rebuilt them on a clean branch with `AC…`/`MG…`
redacted (Campaign/Brand SIDs kept — non-credential and already in the setup doc) and
merged as #57, without rewriting the other session's branches.

### Open
1. STOP/START test against the **Twilio** number `+18327355182` (the A2P-registered one).
2. Proof pipeline trace + Karibi's two product decisions.
3. Karibi's Base44 privacy copy — the other half of the A2P resubmission.
4. `SMTP_PASS` was exposed in plaintext in chat — rotate after launch.
