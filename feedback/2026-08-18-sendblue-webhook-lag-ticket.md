# SendBlue support ticket — inbound webhook delivery lag

**Status:** ready to send. Not sent.
**Account:** `kiba`  ·  **Number:** +1 469 563-4418
**Prepared:** 2026-08-18

---

## Message to send

> Subject: Inbound webhook delivery taking 2.4–4.0s after your own processing completes
>
> Hi — we're on account `kiba`, number **+1 469 563-4418**, and we've isolated a
> consistent delay in inbound webhook delivery. Using **your own timestamps**, not ours:
>
> ```
> date_sent      2026-08-18T17:21:14.777Z    message sent
> date_updated   2026-08-18T17:21:14.967Z    +190ms   your processing
> our receipt    2026-08-18T17:21:18.338Z    +3371ms  webhook delivered to us
> ```
>
> So your side processes the message in **190 milliseconds**, and then the webhook
> takes a further **3.4 seconds** to reach our endpoint. That pattern is consistent:
> median `date_updated` → our receipt is **2.66s** across recent traffic, with
> individual samples from 2.39s to 4.05s and an outlier at 7.1s.
>
> Two things suggest this is specific to delivery rather than general load:
>
> 1. **Outbound is fine.** Our `POST /api/send-message` is accepted in ~510ms, and
>    your `date_sent` → `date_updated` on outbound messages is ~850ms. Only the
>    inbound webhook leg is slow.
> 2. **Our endpoint is not the bottleneck.** The delay is measured up to the moment
>    the request arrives at our server, before any of our processing. Our webhook
>    handler returns 200 in under 20ms.
>
> Our product is a conversational SMS coach, so this delay is added to every single
> reply and is the largest single component of the round trip our users experience.
>
> **One question:** every inbound payload we receive carries `"plan":"inbound_only"`.
> Could you confirm what that plan denotes for this number, and whether it affects
> webhook delivery priority or queuing? We want to rule out a plan-tier explanation
> before assuming this is a platform-wide characteristic.
>
> Happy to supply more samples, message handles, or a time window to correlate
> against your logs. For reference, message handle for the sample above is
> `020E6837-998F-481D-9127-E35CB505563F`.
>
> Thanks.

---

## Why this ticket is worth filing

They have acted on this data before. On 2026-08-03 we measured inbound lag at
p50 **2601ms**, p90 4738ms, max **10225ms**. By 2026-08-18 the tail had collapsed to
max ~4.6s. Something on their side improved after the last round of numbers, so a
specific, evidence-led ask has a track record of working here.

## What is NOT the cause (already ruled out)

| Suspected | Ruled out because |
|---|---|
| Our server being slow | Webhook handler ACKs in <20ms; the lag is measured *before* arrival |
| Apple / iMessage delivery | Sits outside this window entirely — `date_updated` is SendBlue's own clock |
| Cold TCP/TLS handshakes | Shared keep-alive agent; the typing indicator pre-warms the socket |
| A queue backlog on our side | There is no queue on the inbound path — the debouncer calls the processor directly |
| Prompt or model latency | Model call is 1.47–1.63s and sits *after* this window |

## The round trip, for context

Measured 2026-08-18, text replies:

| stage | ms | whose |
|---|---|---|
| SendBlue processing (`date_sent` → `date_updated`) | 190 | SendBlue |
| **Webhook delivery to us (`date_updated` → receipt)** | **2658** | **SendBlue** |
| Our pre-work (session, todos, context) | 351 | ours |
| Model generation | 1629 | ours |
| Our send accepted by SendBlue | 511 | ours |
| SendBlue → Apple → device | ~1000 (inferred) | SendBlue + Apple |

Founder stopwatch on the same turns: **7–11 seconds**. Our controllable slice is
~2.5s of that.
