---
id: 060
title: Proposal rebuilt as a proposal + mobilisation and protections
stage: general
date: 2026-07-29
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (chat)
labels: ["client-comms", "pricing", "proposal", "commercial-terms"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - phase 2/new plaanning/make_full_proposal_doc.py (rewritten, v3)
 - phase 2/new plaanning/KIBA_Phase2_Phase3_Proposal_2026-07-29.docx
 - phase 2/new plaanning/KIBA_Phase2_Phase3_Proposal_2026-07-29.pdf
tests:
 - asserts in-generator: Phase 2 $24,100 + Phase 3 $48,000 == $72,100
 - mobilisation derived from the phase totals, not typed
---

## Prompt

all good but need mobilisation payment in advance 10% and keep some points for my safety too

(preceded by) the proposal do not seem like one its very confusing , make it look like
proposal and break into phase2 and 3 as i told preiously, quick and easy money first ,
then also show payment term ,like ready to build

## Response snapshot

**Why v2 failed.** It was organised by track (A–J) in build order with a
paragraph of prose each, and the phase split appeared only at the end. That is a
reference document. The client reads a proposal top-to-bottom expecting to be
sold something.

**v3 restructure.** Phases became the spine, not the conclusion:
cover page with the summary table → the short version → what is already live →
**Phase 2 in full** → **Phase 3 in full** → payment terms → timeline → ready to
build.

Within each phase, steps are grouped into named blocks ordered fastest-payback
first, each with a running cumulative so the money curve is visible:

| Phase 2 block | Price | Cumulative |
|---|---|---|
| They can finally see it | $4,500 | $4,500 |
| It can answer anything | $1,600 | $6,100 |
| A reason to open it every day | $3,750 | $9,850 |
| Other people are watching | $10,500 | $20,350 |
| The logs | $3,750 | $24,100 |

Live search moved to second — cheapest step in the proposal and it closes the
churn risk Karibi named himself. Logs went last with the reason stated in the
document rather than left implicit.

**Commercial terms added.** Mobilisation at 10% per phase, derived from the phase
totals rather than typed: **$2,410** (Phase 2) and **$4,800** (Phase 3). Framed
as an advance credited against the closing invoices — it reduces what is left to
pay rather than adding to the total. Unused balance on early stop becomes a
12-month credit rather than being refunded or forfeited; flagged to the user as
the one judgment call worth changing.

**Protections**, written as a reciprocal pair of tables ("what you are protected
on" / "what I need in return") so it reads as terms rather than a list of
conditions:

- deemed acceptance after 5 working days of silence
- clock pauses when blocked on the client; re-quotable past 15 working days
- late payment past 14 days pauses *new* steps only — nothing delivered is switched off
- ownership transfers per step on payment for that step
- Apple/Google review, attorney, Plaid contracting and provider outages excluded from all day counts
- day counts are estimates; the fixed price is the commitment
- **third-party running costs are the client's and explicitly not in the build price** — Plaid per connection, search usage, developer accounts, hosting, messaging

That last one was the most valuable addition: Plaid alone runs $1.50–$2.00 per
connected user per month, and without the line the $9,500 could be read as
including it.

## Outcome

- ✅ Impact: A document that reads as a proposal and closes with a specific ask — a yes plus $2,410 — instead of trailing off into a totals table.
- 🧪 Tests: totals asserted in-generator; mobilisation computed from them.
- 📁 Files: generator rewritten; 8-page .docx + .pdf.
- 🔁 Next prompts: user review of the 12-month-credit clause; tomorrow — the sim-vision run and the bubble-gap decision.
- 🧠 Reflection: "It doesn't look like a proposal" was a structural note, not a copy note. Reordering by payback and adding terms did more than any rewording would have.

## Evaluation notes (flywheel)

- Failure modes observed: Built a reference document when a sales document was asked for — organised by how the work is built rather than by how it is bought.
- Graders run and results (PASS/FAIL): PASS — asserts hold at $72,100.
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): none pending; if the client pushes back on mobilisation, the fallback is a smaller advance on Phase 2 only.
