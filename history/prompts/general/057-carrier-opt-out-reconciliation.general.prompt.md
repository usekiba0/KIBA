---
id: 057
title: Carrier opt-out reconciliation
stage: general
date: 2026-07-29
surface: agent
model: claude-opus-5[1m]
feature: none
branch: fix/carrier-opt-out-reconciliation
user: usekiba0
command: (freeform request)
labels: ["a2p", "compliance", "opt-out", "twilio", "dual-channel", "messaging"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/51
files:
 - backend/src/messaging/messaging.service.ts
 - backend/tests/unit/carrier-opt-out.spec.ts (new)
tests:
 - backend/tests/unit/carrier-opt-out.spec.ts (11 cases)
 - full unit suite — 97 suites / 1332 tests pass
 - tsc --noEmit clean
---

## Prompt

do what is on your pat

## Response snapshot

Read as "do the items on my side" — the engineering work that needs neither the founder nor the Twilio console. Of the open items, exactly one qualified: the dual-channel opt-out gap I had flagged as unverified when reviewing the campaign's default opt-out notice. The others are all founder decisions (stranded-commit close gap, dead mid-trial touchpoint) or console/browser actions (consent screenshot, sender pool, STOP test, Render env).

**Verified the gap before building anything.** `sendViaTwilio` catches, logs and rethrows with no special handling for any Twilio error code. Traced the opt-out write path (`coaching.processor.ts` → `opted_out_at` + `drainScheduledJobs`) and the outbound gate (`MessagingService.hasOptedOut`, fails closed). Confirmed: nothing anywhere reconciles a carrier-side opt-out.

**The failure it leaves.** KIBA is dual-channel and only one channel routes STOP through our code. Over iMessage (SendBlue) nothing intercepts, so `opt-out.ts` does the full job. Over SMS, Twilio's default opt-out management answers STOP itself and blocks the number; our webhook may never see it. The user then stays `opted_out_at: NULL` — active in admin, check-ins still scheduled, every send failing with a 21610 that reads like a generic error. Silent user, we think they're fine, only trace is an unwatched log line. That is the exact failure the opt-out system exists to prevent, arriving through the one door it does not watch.

**Fix.** The first outbound attempt after their STOP is what surfaces it, so that is where we catch up. `sendViaTwilio` treats 21610 as what it literally means, stamps `opted_out_at` with keyword `'carrier'` (so admin shows provenance), and returns rather than rethrowing — an undeliverable message should not consume retries failing identically.

Three deliberate constraints, each with a reason in the code:
- **Only 21610.** 30007 (carrier filtering), 21211/21614 (bad number) and auth errors still rethrow. Falsely flagging someone silences them permanently — worse and quieter than a bounced message.
- **No queue drain**, unlike the keyword path: the outbound gate blocks any job that fires (already documented there as the real guarantee), and MessagingService cannot reach the accountability queue without a circular dependency.
- **Never throws out of reconciliation.** The send is already correctly abandoned; a DB blip must not become an unhandled rejection, and the next attempt retries it.

PR #51 opened. Noted in the PR that this is a safety net, not a replacement: if Twilio does forward STOP to `/v1/webhooks/sms`, the existing handler wins and this path never fires. Only the live Android STOP test can settle which.

## Outcome

- ✅ Impact: closes a compliance hole that only opens once SMS traffic starts — i.e. exactly when the A2P campaign approves.
- 🧪 Tests: 11 new cases; 97 suites / 1332 tests pass; tsc clean.
- 📁 Files: 1 source, 1 new spec.
- 🔁 Next prompts: merge #51; after campaign approval run the live STOP test from an Android handset and confirm admin reflects it.
- 🧠 Reflection: the gap came from reading Twilio's own UI copy ("we handle opt-out for you by default") against a dual-channel architecture. The convenience feature is only convenient for the channel Twilio can see.

## Evaluation notes (flywheel)

- Failure modes observed: a platform handling a compliance keyword "for you" silently diverges from application state; single-channel assumptions in a dual-channel product.
- Graders run and results (PASS/FAIL): unit PASS (1332/1332); tsc PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): an admin query for users with recent 21610s but no `opted_out_at`, as a standing reconciliation check rather than a per-send one.
