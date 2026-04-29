---
id: "002"
title: RYKE AI Constitution v1.1.0
stage: constitution
date: 2026-04-28
surface: agent
model: claude-sonnet-4-6
feature: none
branch: master
user: Sumair Roudani
command: /sp.constitution
labels: ["constitution","amendment","ryke-ai","mvp","tech-stack","test-first","token-efficiency"]
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

Ryke AI is an SMS-based AI wellness coaching platform designed to provide users with fitness,
nutrition, and mental wellness guidance through simple text messaging.

The goal of Phase 1 is to launch a Minimum Viable Product (MVP) that allows users to:
- Sign up via a website using their phone number
- Receive a welcome SMS
- Start interacting with an AI coach via SMS
- Get basic recommendations and guidance

The system should simulate a real coaching experience by maintaining conversational context,
responding in a human-like tone, and providing actionable suggestions.

Tech stack:
- Backend: Node.js (or Python)
- AI Engine: OpenAI / Claude
- SMS Integration: Twilio (or similar)
- Database: PostgreSQL
- Frontend: React or Next.js (landing page only)
- Deployment: AWS / Vercel / similar

Non-negotiable principles:
- SMS-first experience (no app dependency)
- Simple and fast MVP delivery (avoid over-engineering)
- Human-like AI responses (natural, conversational tone)
- Action-oriented interactions (guide users, not just respond)
- Predefined test cases (test-first approach)
- AI token-friendly (minimise token usage)

## Response snapshot

Updated constitution from v1.0.0 → v1.1.0 (MINOR bump). Added 4 new principles:
(VIII) YAGNI & MVP-First Delivery, (IX) Human-like & Action-Oriented AI,
(X) Test-First Quality, (XI) Token-Efficient AI. Added Phase 1 MVP Scope Boundary section
(in-scope vs out-of-scope items explicitly listed). Added Confirmed Tech Stack table.
Added 3 new quality gates: MVP Scope Gate, Test-First Gate, Token-Efficiency Gate.
All 11 principles now have Phase 1 scope notes. NON-NEGOTIABLE count raised to 4 (added VIII).

## Outcome

- ✅ Impact: Constitution now fully governs Phase 1 MVP — scope boundary, tech stack, and
  test/token constraints are law for all future specs and plans
- 🧪 Tests: none
- 📁 Files: .specify/memory/constitution.md (amended, v1.1.0)
- 🔁 Next prompts: /sp.specify <feature>, then /sp.plan
- 🧠 Reflection: Phase 1 MVP scope boundary is the most operationally critical addition —
  prevents scope creep into Phase 2 features during implementation

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment: Validate MVP Scope Gate catches Phase 2 features during /sp.specify
