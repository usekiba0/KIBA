---
id: 056
title: Spec accuracy fix + master priced build order
stage: general
date: 2026-07-29
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (chat)
labels: ["client-comms", "pricing", "phase-2", "phase-3", "build-order", "spec-accuracy"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - phase 2/KIBA_Full_Product_Spec 2.html (7 accuracy edits)
 - phase 2/new plaanning/make_master_build_order_doc.py
 - phase 2/new plaanning/KIBA_Master_Build_Order_2026-07-29.docx
 - phase 2/new plaanning/KIBA_Master_Build_Order_2026-07-29.pdf
tests:
 - totals computed from the WAVES data structure, not by hand
 - all 28 Phase 2 steps verified present across the waves; wave sum reconciles to $70,500 + $45,000
---

## Prompt

1) quiet fix 2) lest list all specs and pricing and then priotize them according to pre requisite or easy money first and forwad

## Response snapshot

**1. Quiet fix.** Audited the whole "Phase 1 — Complete / Core System ✓ Built"
section of `KIBA_Full_Product_Spec 2.html` against the codebase rather than
fixing only the one line already found. Two claims were false, both edited in
place with no changelog and no announcement — the edits move the document toward
accuracy, which is the only direction a quiet fix should go:

- **Bandwidth secondary SMS provider** — claimed built in the checklist, the
  Email Capture description, and the architecture table. Only SendBlue + Twilio
  are wired. Reworded to "modular provider layer — second SMS provider addable
  without a rewrite", which is true.
- **"2-7s human jitter"** — claimed in the Anti-Ban Stealth Layer description,
  the checklist, the architecture table and a badge. No jitter exists in the
  code, and we deliberately removed the batching delay on 21 July for latency.
  Reworded to describe what is real: per-number rate limiting, paced multi-part
  replies, and no artificial delay before replying.

Circuit breaker, rate limiting and BullMQ were checked and are real. 7 edits
total.

**2. Master build order.** Priced everything that was previously a bare "GAP" in
the inventory and sequenced the lot into 13 waves. Ordering rule: never schedule
something before its prerequisite, and within what is unblocked take the cheapest
route to money or visible value first.

Key sequencing calls:
- **Wave 1 ($6,500)** — dashboard, proof gallery, streak card, score screen, plus
  shareable score cards. Score cards were pulled forward out of Phase 3: at
  $2,000 they are the cheapest acquisition mechanism in the spec and they only
  need A2/A3.
- **Wave 2 ($8,250)** — includes **streak insurance ($5/pass, $2,500)** early,
  because it is the fastest new revenue in the document and depends on nothing
  but the streak counter, live since Phase 1.
- **The apps sit at Wave 6, not Wave 1** — biggest single block, and everything
  after is gated on it, so leading with it means months before anything is
  visible.
- **Money Mode and the bank connection sit at Wave 10** — both gated on someone
  outside the build (attorney, Plaid contract). Starting early means paying to
  wait.
- **Parked, not sequenced:** entry-fee contest ($3,500, needs counsel), KIBA
  Wallet (money transmission), pooled pots and user-named charities (excluded on
  the record).

**$115,500 total** — $70,500 already in the Phase 2 step plan, $45,000 the
remainder previously gestured at as "Phase 3". Explicitly marked as not a number
to put in front of the client; the step plan stays the client-facing document.

All totals are computed from a `WAVES` data structure inside the generator rather
than typed, after two earlier documents in this session shipped with hand-arithmetic
errors.

## Outcome

- ✅ Impact: The spec no longer claims two unbuilt features. Every remaining gap now has a price and a position, ordered by dependency and payback.
- 🧪 Tests: All 28 Phase 2 steps verified present across the waves; wave totals reconcile to $70,500 + $45,000 = $115,500.
- 📁 Files: 7 spec edits; new 4-page master build order (.docx + .pdf).
- 🔁 Next prompts: decide which waves become the client-facing Phase 2 vs Phase 3 boundary; item 5a (the refusal prompt fix) is still owed before Friday.
- 🧠 Reflection: Generating totals from a data structure instead of prose is the fix for the failure mode that hit twice earlier today. Worth keeping for every future pricing doc.

## Evaluation notes (flywheel)

- Failure modes observed: Earlier documents in this session carried hand-computed totals that were wrong. Addressed structurally rather than by checking harder.
- Graders run and results (PASS/FAIL): PASS — reconciliation verified programmatically.
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): Reuse the WAVES-style data-driven generator for the client-facing step plan too, so both documents derive from one price table rather than two.
