---
id: 093
title: Fallback trigger for contact card asks
stage: general
date: 2026-08-06
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: "Any update w the apple masking?" -> investigation -> "we are on same page" -> build
labels: ["apple-masking", "contact-card", "retention", "activation", "bull-queue"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/accountability/activation-asks.ts (new)
 - backend/src/accountability/checkin.processor.ts
 - backend/src/accountability/checkin.service.ts
 - backend/src/accountability/proof.service.ts
 - backend/tests/unit/activation-asks.spec.ts (new)
 - backend/tests/unit/checkin.processor.spec.ts
 - backend/tests/unit/checkin-resilience.spec.ts
tests:
 - activation-asks.spec.ts (15 cases: happy path x3, 10 silence guards, 2 boundaries)
 - full unit + contract: 1660 passing, 1 suite / 4 tests skipped (needs live Postgres)
 - tsc --noEmit clean
---

## Prompt

Any update w the apple masking?

(then, after the investigation and a restatement of the ask) — "we are on same page"

## Response

### Diagnosis

"Apple masking" is two mechanisms in very different states.

**Path A — Apple Business brand (brands CALLS only).** Brand `KIBA` + 1024px logo
submitted 2026-07-28, still **In Review** 8 days later. Cannot be checked from here —
needs the client's `business.apple.com` login. Flagged the unresolved org-domain
discrepancy from PHR 044 (`textkiba.com` on Organization Details vs `usekiba.ai` on the
brand) as a plausible cause of the stalled review, since Apple cross-checks the two.

**Path B — the vCard (brands TEXTS).** Every component verified healthy:

| check | result |
|---|---|
| `CONTACT_CARD_URL` in Render prod | SET → `onboarding.usekiba.ai/kiba-contact.vcf` |
| .vcf serves | 200, `text/x-vcard`, 10062 bytes, both numbers + logo |
| `pin-chat.mp4` serves | 200, `video/mp4` (the old octet-stream bug is gone) |
| send failures, 14d | 0 |
| **times it actually fired, 14d** | **1** |

Root cause: `maybeSendActivationAsks` is gated on the user's first accepted proof, and the
proof pipeline records almost nothing (104 photos in, 1 proof ever). So the masking was
never blocked by Apple and was never broken — it was wired behind a mechanism that does
not fire. Two separately-tracked issues turned out to be one consequence.

Also found `proof.service.ts:171` asserting the .vcf send is "a no-op while
CONTACT_CARD_URL is unset" — **stale**, the var is set. Corrected.

### Fix

Added a second, independent trigger rather than moving the send back to the Stripe
webhook. That placement was removed deliberately (`stripe-webhook.controller.ts:203-213`)
because it stacked three texts at the highest-emotion moment of the funnel, which Training
Doc v2 called out by name. The trigger was right in principle; only its hook was wrong.

- **`activation-asks.ts` (new)** — pure `shouldSendActivationAsks()` eligibility rule,
  shape mirrored from `intake-nudge.ts` so the judgement calls are testable rather than
  buried in a processor. Reuses `isSendableHour` so quiet hours have ONE definition.
- **The payment-day guard is `lastCheckinDate`.** A check-in is only scheduled once
  checkout completes, so a non-null value proves the activation message already landed and
  had room to breathe. This preserves the anti-stacking rule with no new column.
- **`checkin.processor.ts`** — `@Process('activation-asks-sweep')`, hourly, fail-soft per
  user. Delegates the actual send to `ProofService.maybeSendActivationAsks` (made public)
  so both triggers share one copy, one send order, and one `activation_asks_sent_at` stamp
  — double-send is structurally impossible.
- **`checkin.service.ts`** — installs the repeatable job alongside the existing three.

**Load-bearing detail:** the one-shot stamp lives inside the `intake_data` jsonb, so the
sweep filters it in SQL (`u.intake_data->>'activation_asks_sent_at' IS NULL`). Without
that, the `LIMIT 100` would keep returning the same already-asked users every hour and a
newly-eligible user past row 100 would never be reached — the exact starvation bug that
would have made this fix silently useless.

### Side finding (user pasted an Upstash email mid-turn)

3 Bull queues on Upstash PAYG with default polling settings. Bull polls Redis regardless of
traffic (5s delayed-guard, 30s stalled-check, ~5s blocking-pop re-issue per queue) —
estimated ~10M commands/month ≈ $20 purely idle. Recommended switching to a Fixed plan
(their console, their billing — not actioned here) and pointed at Console → Usage for the
real meter rather than my estimate.

## Outcome

- Tests: 15 new cases all passing; full unit + contract 1660 passing, 4 skipped
  (pre-existing, needs live Postgres); `tsc --noEmit` clean.
- Two existing DI test modules needed the new `ProofService` provider — fixed.
- NOT committed or pushed — awaiting the user's go.
- Follow-ups: (a) Karibi to chase the Apple brand review + fix the org domain field;
  (b) proof pipeline itself still dead, with 2 product decisions outstanding.
