---
id: "001"
title: RYKE AI Initial Constitution
stage: constitution
date: 2026-04-28
surface: agent
model: claude-sonnet-4-6
feature: none
branch: master
user: Sumair Roudani
command: /sp.constitution
labels: ["constitution","init","ryke-ai","sms-first","wellness","ai"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - .specify/memory/constitution.md
tests:
  - none
---

## Prompt

its an AI based project call 'RYKE AI' The motive behind this app is to help you with nutrition and
wellness, smart scheduling, daily checkin and reminder, mental heath support, ai trained is user
voice and style, coach dash board and analytics, human handsoff alert, response delay setting,
calrories telling just by looking at picture and all this will be done just by sms and no physical
app, future phase is to connect it with all wearables

## Response snapshot

Drafted and wrote the initial RYKE AI Constitution (v1.0.0) to `.specify/memory/constitution.md`.
Defined 7 core principles: (I) SMS-First No-App Interface, (II) AI Personalization,
(III) Safety-First & Human Handoff, (IV) Vision-Powered Nutrition, (V) Coach Observability,
(VI) Privacy & Health Data Security, (VII) Extensible Architecture — Wearables-Ready.
Added Delivery & Operational Constraints, Development Workflow & Quality Gates (5 gates),
and Governance section. Two TODOs deferred: tech stack (to /sp.plan) and ratification owner.

## Outcome

- ✅ Impact: Project constitution ratified at v1.0.0 — all downstream plans and specs now have
  governing principles and quality gates to check against
- 🧪 Tests: none
- 📁 Files: .specify/memory/constitution.md (created/filled)
- 🔁 Next prompts: /sp.specify <feature description>, then /sp.plan
- 🧠 Reflection: SMS-First and Safety-First (human handoff) are the most distinctive constraints
  for this project — plan gates must enforce both rigorously

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment: Validate that SMS-First gate catches any accidental app-dependent feature specs
