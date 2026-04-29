---
id: "003"
title: RYKE AI Constitution v1.2.0
stage: constitution
date: 2026-04-28
surface: agent
model: claude-sonnet-4-6
feature: none
branch: master
user: Sumair Roudani
command: /sp.constitution
labels: ["constitution","amendment","tech-stack","engineering-principles","api-first","webhooks","onboarding"]
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

(Full tech stack and engineering principles provided by user)
Backend: Node.js TypeScript, Express or NestJS. AI: OpenAI/Claude. SMS: Twilio webhooks.
DB: PostgreSQL + Redis. Frontend: Next.js on Vercel. Backend: AWS. Docker preferred.
Engineering principles: API-first, stateless services, strict layer separation (Messaging/AI/Data),
webhook-driven. AI behavior: short, context-aware, one question at a time, always actionable.
Development constraints: 4-8 week MVP, no microservices, no premature integrations.
Out of scope enforced: mobile apps, multi-channel, wearables, dashboards, analytics.

## Response snapshot

Updated constitution from v1.1.0 → v1.2.0. Finalized tech stack (Node.js TypeScript, NestJS/Express,
OpenAI/Claude, Twilio, PostgreSQL, Redis, Next.js, Vercel+AWS, Docker). Added 3 new principles:
(XII) API-First & Strict Separation of Concerns (3 mandatory layers: Messaging/AI/Data),
(XIII) Webhook-Driven & Stateless Messaging, (XIV) Zero-Friction Onboarding (NON-NEGOTIABLE).
Expanded principle IX with strict AI behavior constraints (one question per response, no bullet lists,
always actionable, context-aware). Expanded principle VIII with 4-8 week delivery constraint.
Updated out-of-scope list (added mobile apps, multi-channel). Added 2 new quality gates
(Separation of Concerns Gate, Zero-Friction Gate). NON-NEGOTIABLE count raised to 5 (added XIV).

## Outcome

- ✅ Impact: Constitution now fully governs the engineering architecture — layer separation,
  webhook patterns, onboarding SLA, and AI behavior are all codified as law
- 🧪 Tests: none
- 📁 Files: .specify/memory/constitution.md (amended, v1.2.0)
- 🔁 Next prompts: /sp.specify for MVP feature (Onboarding + SMS AI Coaching)
- 🧠 Reflection: The 3-layer separation (Messaging/AI/Data) and the one-question-at-a-time
  AI rule are the most operationally impactful new additions — they will shape every task

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment: Validate layer separation gate catches cross-layer calls in code review
