---
id: "001"
title: RYKE AI MVP Phase 1 Spec
stage: spec
date: 2026-04-29
surface: agent
model: claude-sonnet-4-6
feature: 001-sms-ai-coaching
branch: 001-sms-ai-coaching
user: Sumair Roudani
command: /sp.specify
labels: ["spec","mvp","sms","onboarding","coaching","mms","crisis-detection","payment"]
links:
  spec: specs/001-sms-ai-coaching/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - specs/001-sms-ai-coaching/spec.md
  - specs/001-sms-ai-coaching/checklists/requirements.md
tests:
  - manual: validate all acceptance scenarios in spec.md against a running system
---

## Prompt

RYKE AI MVP — Phase 1: SMS-first AI coaching platform. Core features: (1) User onboarding via Next.js landing page — phone number entry triggers welcome SMS in under 30 seconds, no email/password/app download required. (2) SMS-based AI coaching conversations covering fitness, nutrition, and mental wellness — human-like, action-oriented, one question per response, context-aware using conversation history. (3) Conversational context maintained per user session via PostgreSQL + optional Redis. (4) Safety-first human handoff — crisis keyword detection triggers immediate supportive holding SMS and coach alert within 5 minutes. (5) Basic user data and conversation history storage.

**Scope additions confirmed by user during spec session:**
- MMS-based photo nutrition analysis — moved to Phase 1 (was Phase 2)
- ML-based crisis detection — moved to Phase 1 (was keyword-only)
- Full onboarding web form before welcome SMS: goals, body metrics, health info, contact details, payment card with 1-month free trial

**Clarifications resolved during spec session:**
- Context storage: PostgreSQL (durable) + Redis (active session fast-access)
- Session inactivity boundary: default 4 hours (configurable; exact value confirmed in planning)

## Response snapshot

Created `specs/001-sms-ai-coaching/spec.md` with 6 prioritised user stories, 26 functional requirements across 5 domains (onboarding/payment, AI coaching, MMS nutrition, session context, safety/crisis), 6 key entities, 10 measurable success criteria, a full assumptions section, and an explicit out-of-scope list.

Created `specs/001-sms-ai-coaching/checklists/requirements.md` — all 16 checklist items pass. Spec is ready for `/sp.plan`.

Branch `001-sms-ai-coaching` created and checked out.

## Outcome

- ✅ Impact: Complete Phase 1 feature specification ready for architecture planning
- 🧪 Tests: All 6 user stories have Given/When/Then acceptance scenarios; 11 edge cases documented
- 📁 Files: specs/001-sms-ai-coaching/spec.md, specs/001-sms-ai-coaching/checklists/requirements.md
- 🔁 Next prompts: /sp.plan — generate architecture plan, data models, and API contracts
- 🧠 Reflection: Three significant scope decisions were made during spec session (MMS → P1, ML crisis → P1, full onboarding form + payment). The session boundary concept (4-hour default) required explanation before user confirmed. Payment processor selection deliberately deferred to planning to keep spec tech-agnostic.

## Evaluation notes (flywheel)

- Failure modes observed: Initial Write tool calls were rejected by user (likely reviewing content carefully) — user confirmed after explanation of session boundary concept
- Graders run and results (PASS/FAIL): Spec quality checklist — all 16 items PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): Consider adding a "pricing/subscription tiers" user story to capture the $20/mo individual vs $99/mo Coach Pro distinction from the product documents
