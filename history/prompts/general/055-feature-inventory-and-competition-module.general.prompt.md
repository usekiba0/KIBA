---
id: 055
title: Feature inventory reconciliation + competition module
stage: general
date: 2026-07-29
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (chat)
labels: ["client-comms", "pricing", "phase-2", "scope-reconciliation", "competition", "legal"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - phase 2/new plaanning/make_feature_inventory_doc.py
 - phase 2/new plaanning/KIBA_Feature_Inventory_2026-07-29.docx
 - phase 2/new plaanning/KIBA_Feature_Inventory_2026-07-29.pdf
 - phase 2/new plaanning/make_phase2_step_plan_doc.py (rewritten, v2)
 - phase 2/new plaanning/KIBA_Phase2_Step_Plan_2026-07-29.docx (regenerated)
tests:
 - arithmetic verified: 28 steps, $70,500 = $52,500 + $9,500 bank + $8,500 competition
---

## Prompt

no first discuss this , where is the proof and daily challenge and competition module

(then) 1) he was expectig it but i informed that its not legal in many states so we siad we
can make something like pay somerhing from a challendge fee or subscription fee . 2) lets
list all points once then we can break it in phase 2 or 3 3) yes please

(then) do that

## Response snapshot

Karibi's challenge caught a real hole. The step plan had been built from the
$52,500 stage list alone, without reconciling against the requirement documents.

**What the audit found.** Reconciled the Full Product Spec (8 phases, 56-item
checklist), the $44k scope confirmation (10 sections), the $52.5k revised scope,
the Dashboard Apps Proposal, and the codebase into one inventory — ~95 features
across 10 sections, marked LIVE / IN / GAP / EXCLUDED / PARTIAL / WRONG.

Findings:
- **Proof** was not missing — it was in four places (Phase 1 live, A2, B3, C3, G2)
  and named in none, which is exactly why he could not find it. Fixed with a
  "where proof lives" map. No new cost.
- **Competition** was in scope but as one $6,000 line reading "friend challenges,
  groups, leaderboards, referrals" — a module described as a footnote.
- **Daily challenges** were a genuine gap: named in the Dashboard Apps Proposal
  ("7-day / 30-day challenge trackers") and in Full Spec Phase 7 (monthly
  challenges), priced in neither scope document.
- **24 real gaps** total, clustering into four groups: retention/competition,
  growth (score cards, public profile, invite deep links), new revenue (streak
  insurance, Boss Mode, corporate), and nice-to-have.
- **The spec is bigger than the scope.** $52.5k buys roughly Full-Spec phases 2-6,
  with phase 6 compressed and phases 7-8 absent. A collision waiting to happen if
  the client is holding the spec as "what Phase 2 delivers".
- **The spec overstates what is built.** Its checklist marks "Secondary SMS
  provider — Bandwidth as Twilio backup" under Core System ✓ Built. Verified
  against the codebase: only SendBlue and Twilio are wired. Caught because I was
  about to repeat the claim.

**Competition redesign.** The user had already told Karibi that pooled pots are
not legal in many states, and they had landed on funding a prize from a challenge
fee or subscription fee. Wrote that up against the governing principle that makes
it work: *KIBA never holds user money, and users never pay each other* — which
removes escrow, money transmission and the Stripe TOS conflict in one move. Three
funding models, ordered by legal exposure: (C) non-cash prizes, (B)
subscription-funded cash, (A) entry fee. Recommended C then B, with A parked
behind the Money Mode attorney — payment to enter + prize + chance is the
three-part lottery test in most states, and skill-based is a legal conclusion
rather than a design choice. Also argued the commercial case: a pot only pays the
winner and every loser is a churn risk, whereas free entry maximises entries, and
entries are the viral mechanic.

**Step plan v2** (rewritten in place rather than as a third document, since the
client had already complained about confusing docs): Track G expanded from 3 thin
steps into 6 — G1/G2 already bought ($4,000), plus G3 challenge engine, G4
templates, G5 the 7/30-day tracker, G6 non-cash prize layer (+$8,500). Store
submission split out into its own Track J where it belonged. Added an explicit
Phase 3 list so what is *not* being bought is on the record.

28 steps, $70,500 ($52,500 + $9,500 bank + $8,500 competition). Largest step
still $4,000, median $2,500, 23 of 28 at $3,000 or less — the "no big number"
property survives the scope increase.

## Outcome

- ✅ Impact: The proposal now reconciles against every requirement document instead of one stage list. The module the client asked about is priced, and the legal replacement for pooled pots is designed rather than deleted.
- 🧪 Tests: Per-track sums and grand total verified by script before generating.
- 📁 Files: new inventory doc (6pp) + regenerated step plan (6pp), both .docx and .pdf.
- 🔁 Next prompts: user decides whether to correct the Full Product Spec (not done — it rewrites a document the client already holds, so it needs explicit sign-off); then which remaining gaps move from Phase 3 to Phase 2.
- 🧠 Reflection: Building the step plan from the scope doc alone was the actual mistake. The client found the gap before I did, which is the wrong way round — the requirement documents should have been the source, with the scope doc as one input among several.

## Evaluation notes (flywheel)

- Failure modes observed: (1) Scoped a proposal from a derived document rather than from the source requirements. (2) Nearly repeated a false "already built" claim from the client's own spec — caught only by checking the codebase.
- Graders run and results (PASS/FAIL): PASS — totals reconcile; Bandwidth claim verified false against source.
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): Before any future scope or pricing document, enumerate the source requirement files first and reconcile against all of them, rather than extending the most recent derived doc.
