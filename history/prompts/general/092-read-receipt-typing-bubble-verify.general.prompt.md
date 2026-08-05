---
id: 092
title: Verify read receipt and typing bubble in prod
stage: general
date: 2026-08-05
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: "Yes can u turn on the instant \"read\" message and then have the typing bubble on for KIBA"
labels: ["latency", "sendblue", "presence", "read-receipt", "typing-indicator", "prod-measurement"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - (none — no code change was needed)
tests:
 - (none — verification was prod log analysis)
---

## Prompt

Yes can u turn on the instant "read" message and then have the typing bubble on for KIBA

## Response

**Both features were already built, wired, and firing.** No code change made — the request
was for something that already exists, so the useful work was verification, not building.

Both fire fire-and-forget from the inbound webhook at `messaging.controller.ts:113-120`:
`sendReadReceipt()` then `sendTypingIndicator()`, inside `setImmediate` so neither can
cost the webhook its 200.

### Prod evidence (last 2 days, Render logs)

| operation | unique calls | failures |
|---|---|---|
| `send_read_receipt` | 185 | 0 |
| `send_typing_indicator` | 185 | 0 |

Read receipt response body: `{"status":"OK","message":"Mark read request sent"}`.
Typing indicator response: `status: "SENT"`.

### Ruled out: the SMS hypothesis

Recipient tally showed 128 calls to +1 (US/CA) and 57 to +92 — the +92 being the user's
own test number and the single heaviest recipient. Since both features are iMessage-only,
the obvious theory was that the user tests over SMS and therefore could never see either.

**Checked instead of asserting — the theory was wrong.** Every thread is iMessage,
including +92…863 (57 iMessage / 0 SMS). No green-bubble explanation exists.

### The actual finding

`messaging.service.ts:300-303` documents that read receipts **require manual activation by
SendBlue support on the account**, and that the endpoint returns 200 either way — a silent
no-op until activated. The observed response `"Mark read request sent"` confirms only that
the *request* was sent, not that anything was marked read. That is exactly the response an
unactivated account produces, which reconciles "logs look perfect" with "looks off from
the outside".

Delivered: a 5-second device check to settle it (does the user's own thread show "Read"?),
and a ready-to-send draft email to support@sendblue.com requesting activation, including
the sending number and the call volume as evidence.

### Secondary gap surfaced

A brand-new lead's very first inbound message gets **no** typing bubble — SendBlue requires
an existing conversation before it will render one (documented at `messaging.service.ts:378-382`).
That is the highest-friction moment in the funnel and has no API-side fix.

## Outcome

- No code changed; nothing was off.
- Blocked on a third party: SendBlue must activate read receipts on the account.
- Follow-up: if the device check shows "Delivered", send the drafted support email.
