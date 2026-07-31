---
id: 054
title: Phase 2 repackaged as approve-as-you-go steps
stage: general
date: 2026-07-29
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (chat)
labels: ["client-comms", "pricing", "phase-2", "packaging"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - phase 2/new plaanning/make_phase2_step_plan_doc.py
 - phase 2/new plaanning/KIBA_Phase2_Step_Plan_2026-07-29.docx
 - phase 2/new plaanning/KIBA_Phase2_Step_Plan_2026-07-29.pdf
tests:
 - arithmetic verification: every track sums to its original stage price; grand total $62,000 unchanged
---

## Prompt

lets work on phase 2 proposal in the meantime . need to break items into multiple phases so that amount donot sound big to him

## Response snapshot

Packaging problem, not a scope problem. The 21 July stage plan asked the client to
approve numbers ($13,500 "App Core") rather than pieces of work.

Rebroke the identical scope into **24 steps across 7 tracks**. Nothing added,
removed or repriced — every track still sums exactly to its original stage price,
verified arithmetically before generating:

| Track | Steps | Total |
|---|---|---|
| A Web dashboard / mini apps | 6 | $10,000 |
| B Mobile apps | 5 | $13,500 |
| C GPS + Health | 3 | $9,000 |
| D Screen Time | 2 | $6,000 |
| E Money Mode | 2 | $8,000 |
| F Bank connection (v1, new) | 3 | $9,500 |
| G Social + store launch | 3 | $6,000 |
| **Total** | **24** | **$62,000** |

Largest single step $4,000, smallest $750, median $2,750, 19 of 24 at $3,000 or
less. A1+A2 = $3,750, deliberately identical to the launch bundle quoted in the
pre-launch answers doc, so the two documents reconcile.

Framing choices that do the actual work:
- Five ground rules up front — one step at a time, every step ships something
  visible, stop whenever, fixed price per step, pay on delivery.
- A recommended **order** that is not the numbering: A1+A2 ($3,750) → A3+A4
  ($2,500) → decide the rest from real usage data at the $6,250 mark.
- "What you are deciding right now" reduced to a single $2,500 step.
- Grand total kept, once, at the end, explicitly marked as not-for-approval.

Kept the total deliberately: smaller commitment units are legitimate and genuinely
de-risk the client's decision, but a client who later feels the total was concealed
is a client who disputes an invoice. Flagged to the user that they can cut that
section if they disagree.

Caught three wrong summary claims in my own draft before generating — "21 steps"
(actually 24), "most under $3,000" (exactly half), and "median $2,500" (actually
$2,750). Verified with a script rather than by eye, since a client cross-checking
against the 21 July doc would find any drift.

## Outcome

- ✅ Impact: The same $62,000 of work now presents as a $2,500 first decision, with no number above $4,000 anywhere in the document.
- 🧪 Tests: Per-track sums and grand total verified against the 21 July scope.
- 📁 Files: generator script + .docx + .pdf (5 pages).
- 🔁 Next prompts: user reviews the step prices against their own rate card; then item 5a (the refusal prompt fix, free, still owed before Friday).
- 🧠 Reflection: The step boundaries had to be real — each one ends in something openable on a phone — or the restructure is cosmetic and collapses the first time a step delivers nothing visible.

## Evaluation notes (flywheel)

- Failure modes observed: Drafted three summary statistics from memory that were all wrong; only caught by computing them. Any of them would have been trivially falsifiable by the client.
- Graders run and results (PASS/FAIL): PASS — arithmetic reconciles to the prior quote.
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): Ask whether he wants steps batched into approval groups of 2-3, since 24 separate approvals has a real admin cost on both sides.
