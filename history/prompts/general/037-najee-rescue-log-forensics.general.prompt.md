---
id: 037
title: Najee rescue and log forensics
stage: general
date: 2026-07-23
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: master
user: usekiba0
command: none
labels: ["production", "forensics", "reminders", "payment-link", "render-logs"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - (no code changes — prod investigation; one prod mutation: cancelled duplicate reminder 3c9255c2 via admin DELETE)
tests:
  - (none — forensic session; verified via Render logs API + admin API state)
---

## Prompt

yes

## Response

Follow-up to the thread re-audit: executed the Najee "rescue" + log dig and OVERTURNED both lost-conversion P0s.

**Findings:**
1. Najee was never dropped — Render logs show the plan link sent 3s after "Run it" (07-22T03:14:11, two SendBlue QUEUED sends = leadIn + URL, `sms_payment_link_sent`), plus dunning nudge (~2.5h later, dunning_nudges_sent=1). He has the link; hasn't tapped it.
2. Sam got his link too (payment_link_sent_at 06-24T19:14:39), checked out 85 seconds later, and has an ACTIVE paying subscription since 07-01.
3. Root cause of both false alarms: sendPaymentLink texts via messagingService.send() without recorder.record() — link + dunning sends are invisible in the messages table (admin UI, audits, AI history). PR #33 fixed this for reminder fires only.
4. Karibi's "pings never fire" P0 partially overturned: reminders were created and fired (6:30am ping QUEUED at 07-20T11:30:20Z) but were invisible pre-#33 — KIBA apologized for pings it actually sent. The REAL failure: all three 07-22 daily-chain rows (leg-day + 2× Bible verse) were cancelled out-of-band (no AI cancel tool calls in logs; admin DELETE or cleanup script; cancel() logs nothing and writes no reason/actor). Chain re-enqueue happens only on fire ⇒ cancelling a pending link kills the daily chain forever — Karibi's chains are dead since 07-22.
5. Live bug fixed in prod: triple-confirm on 07-23T01:24 created two duplicate "tailor pickup" one-shots for 15:00Z (different wording defeated reminderSignature supersede). Cancelled the later dup (3c9255c2…), kept the original (a8aa1226…).
6. Additional footguns: cleanup-orphan-jobs-and-dup-reminders.js groups daily-chain dups by (user, local_time) ignoring message — different 9am chains read as dups; Bible-verse chain resends the same frozen verse text daily.

**Proposed fixes (not yet implemented):** record link/dunning sends to thread; add logging + actor/reason to cancel(); widen reminderSignature; fix cleanup-script dedup key; decide skip-vs-kill semantics for chain cancels; decide whether to recreate Karibi's dead chains and whether to send Najee a human follow-up.
