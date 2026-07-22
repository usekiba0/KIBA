---
id: 031
title: Retraining doc re-grade kickoff
stage: general
date: 2026-07-22
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: master
user: usekiba0
command: none
labels: ["retraining", "scheduled-layer", "audit"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - (audit in progress — see PHR 032 for the build work)
tests:
 - none yet
---

## Prompt

continue

(Daytime session — per saved memory, this begins the KIBA_Retraining_Doc work: re-grade the doc against current master before rebuilding anything; client instruction is to REBUILD the scheduled layer, not disable it.)

## Response

Kickoff of the re-grade. Verified independently before building:

- Master is clean at `880df2a`; only stale PR #2 open.
- Twilio: the new business profile (BU2809…) is NOT visible via the account-scoped
  Trust Hub API — only the old starter profile and a leftover DRAFT "KIBA" trust
  product from the abandoned sole-prop wizard. Console is source of truth for
  review status.
- `STRIPE_TRIAL_DAYS`: Joi default 3, but SEVEN call sites carry a dead `, 7`
  fallback (checkin.processor 470/528, coaching.processor 816/1283,
  checkout.service 146/191, onboarding.service 59). Dead today because Joi
  always fills the default, but it means "7 days free" copy is one schema edit
  away from resurrecting. Folded into the template-cleanup batch.
- Existing coaching prompt already covers parts of B7 (don't-assume/accuse,
  confidence calibration, 3rd-excuse gating) — the gaps are ego stakes,
  identity referendums, fake forks, and ownership-with-repair.

Two Explore agents dispatched: (1) recap + weekly review + todo seeding + score
data sources — can they still accuse falsely; (2) ghost context inputs + a
banned-copy sweep ("free", "zero risk", crutch emoji, stale "7 day" trial) across
all deterministic templates.

Full re-grade table and build plan follow in the next PHR once the audits land.
