---
id: 085
title: Log provider forwarding lag on turn latency
stage: general
date: 2026-08-03
surface: agent
model: claude-opus-5[1m]
feature: none
branch: feat/provider-lag-metric
user: usekiba0
command: follow-up to the SendBlue-vs-alternative-provider question ("yes")
labels: ["observability", "latency", "sendblue", "metrics"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/74
files:
 - backend/src/messaging/message-debouncer.service.ts
 - backend/src/messaging/messaging.controller.ts
 - backend/src/messaging/coaching.processor.ts
 - backend/tests/unit/message-debouncer.service.spec.ts
tests:
 - message-debouncer.service.spec.ts (6 providerLagMs cases + 2 plumbing cases)
 - full unit + contract: 1625 passing, 1 suite / 4 tests skipped (needs live Postgres)
---

## Prompt

yes

(Agreeing to: "I'd like to start logging that inbound lag as a field on `turn_latency`,
so perceived latency stops being invisible in our own dashboards.")

## Response snapshot

**The blind spot.** `turn_latency.e2eMs` starts at `receivedAt`, which the
debouncer sets to our webhook receipt. Everything the provider spent getting the
message to us was therefore missing from every latency figure we have quoted —
including the ones used to argue that prompt caching and streaming wouldn't help.

**The measurement that motivated it** (2026-08-03, n=104, 4-day sweep): comparing
SendBlue's own `date_updated` to our Render log timestamp gives p50 **2601ms**,
p90 4738ms, max 10225ms, mean 3022ms. The **387ms minimum** is the sanity check —
a large constant clock offset would have raised the floor too, so most of the p50
is real latency rather than skew.

Share of user-perceived latency: **~48% of a fast text turn** (e2e 3577ms), but
only **~15% of a photo turn** (e2e 17596ms), where `genMs` and our own deliberate
4–8s debounce dominate.

**What shipped.** The controller parses `date_updated`; the debouncer carries it
for the FIRST webhook of a batch (pairing with `firstPushAt`); `turn_latency`
gains two fields:

- `providerLagMs` — provider hand-off time, or null when unknown
- `perceivedMs` — `e2eMs + providerLagMs`, what the user actually waited

`providerLagMs()` returns null on a negative or >120s value: those mean the two
server clocks disagree, not that the provider was slow. A wrong number is worse
than no number here, because this metric exists to inform a provider-migration
decision. Twilio SMS has no equivalent field and reports null rather than a
fabricated zero.

## Outcome

- ✅ Impact: perceived latency is now visible in our own logs; "should we move off SendBlue" becomes a query rather than an investigation.
- 🧪 Tests: 6 boundary cases on the guard (null / negative / >120s / zero / NaN / exact) plus 2 plumbing cases; 1625 passing; `tsc` clean.
- 📁 Files: 3 source, 1 spec.
- 🔁 Next prompts: after a day of traffic, chart `providerLagMs` p50/p90; if a competitor trial happens, compare the SAME field on a second number.
- 🧠 Reflection: the metric was measuring the part of the system we control and calling it end-to-end. Worth auditing other "e2e" numbers for the same framing error — a boundary chosen for implementation convenience quietly became the definition of the user's experience.

## Evaluation notes (flywheel)

- Failure modes observed: an end-to-end metric whose start boundary excluded a third of the user's wait; and the temptation to use `date_sent` (device clock, skewed on iMessage) instead of `date_updated` (server clock), which would have produced a confidently wrong number.
- Graders run and results (PASS/FAIL): unit + contract PASS (1625); typecheck PASS.
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): emit `providerLagMs` for outbound too, once a delivery-receipt webhook is wired — the SendBlue→Apple→handset leg is still completely unmeasured.
