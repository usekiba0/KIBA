---
id: 057
title: Complete Phase 2 + Phase 3 client proposal
stage: general
date: 2026-07-29
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (chat)
labels: ["client-comms", "pricing", "phase-2", "phase-3", "proposal"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - phase 2/new plaanning/make_full_proposal_doc.py
 - phase 2/new plaanning/KIBA_Phase2_Phase3_Proposal_2026-07-29.docx
 - phase 2/new plaanning/KIBA_Phase2_Phase3_Proposal_2026-07-29.pdf
 - phase 2/new plaanning/make_master_build_order_doc.py (trimmed to requested scope)
tests:
 - assert p2_total + p3_total == 70500 inside the generator
 - master build order carries the same assert against the step plan
---

## Prompt

since the price is higher lets only quote for what he has asked for

(then) show me list of feaetrue we are suggestig to make now

(then) lets make a complete proposal of phase 2 and 3 , so that propsal shoild explain
little about all features and then at the ending we suggest this should pahse 2 or 3 and pricing

## Response snapshot

**Trimmed to requested scope.** Dropped ~$45,000 of unrequested roadmap work
(enterprise, Boss Mode, streak insurance, calendar, monthly challenges, score
cards, public profile, deep links, grocery/study/finance trackers, searchable
history, analytics, health/location challenges). Kept it listed in the internal
build order as "not requested, not priced" — and critically, at the numbers
already quoted in `KIBA_Client_Email` ($7,000 Phase 7 bundle, $10,000 Phase 8)
rather than the fresh ones I had invented, which was the actual defect the user
caught.

Ran the contradiction sweep that prompted this: every remaining number traces to
the $52,500 scope or to something Karibi asked for on 29 July. G1+G2+J1 sums to
exactly $6,000 = Stage 2.5. **The only two collisions were Phase 7 and Phase 8 —
the two things never requested** — so removing them removed the problem entirely.

**The proposal.** Client-facing, 6 pages: every one of the 28 steps explained in
plain terms, grouped into 8 tracks with a "what it is / why it matters" paragraph
each, a "where proof lives" map, then the phase split and pricing at the end so
features are read without a number in peripheral vision.

**The split line is the interesting part** — not web-vs-mobile and not
cheap-vs-expensive:

> **Phase 2 is everything that needs nobody's permission.**

No Apple entitlement, no Play review, no attorney, no Plaid contract. Tracks A
and G can start on approval and ship continuously. Phase 3 is everything gated on
an outside party, plus the apps (heaviest block, everything downstream gates on
them).

- **Phase 2 — $22,500, 12 steps** (Tracks A + G): dashboard, mini apps, full
  challenges and competition module. A complete marketable product on its own.
- **Phase 3 — $48,000, 16 steps** (B, J, C, E, F, D): native apps, store launch,
  GPS/health, Money Mode, bank connection, screen time.
- **Total $70,500**, unchanged.

This also finally solves the "don't make it sound big" problem properly: the
headline is $22,500, and the actual first decision is A1 at $2,500.

Both generators now carry a hard assert against $70,500, so the proposal, the
step plan and the build order cannot silently drift apart.

## Outcome

- ✅ Impact: One client-facing proposal covering both phases, containing only requested work, with a defensible split rationale and no number the client has not already seen.
- 🧪 Tests: Totals asserted in-generator; Phase 2 + Phase 3 = $70,500.
- 📁 Files: new proposal (.docx + .pdf); build order trimmed (regeneration pending — file locked in Word).
- 🔁 Next prompts: regenerate the master build order once unlocked; item 5a (refusal prompt fix) still owed before Friday.
- 🧠 Reflection: "Only quote what he asked for" turned out to also be the fix for the pricing contradictions — every collision was in unrequested work. Scope discipline and pricing integrity were the same problem.

## Evaluation notes (flywheel)

- Failure modes observed: Invented new prices for two items already quoted to the client in an earlier email. Root cause: reconciling only against the most recent pricing document instead of all of them.
- Graders run and results (PASS/FAIL): PASS — asserts hold; sweep found no further contradictions.
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): Keep one shared price table that all three documents import, rather than three generators each holding their own copy of the numbers.
