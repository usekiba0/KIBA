---
id: "002"
title: RYKE AI User Journey Document HTML
stage: general
date: 2026-04-28
surface: agent
model: claude-sonnet-4-6
feature: none
branch: master
user: Sumair Roudani
command: create user journey document in HTML format
labels: ["user-journey","product-docs","html","design","onboarding"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - project documents/rykeai-user-journey.html
tests:
  - manual: open in browser and verify all 7 phases render correctly
---

## Prompt

need to create a user journey document for ryke ai, make one and share it in an html format as output, Make it visually appealing and explanatory for users

## Response snapshot

Created a fully self-contained HTML user journey document at `project documents/rykeai-user-journey.html`.

The document covers:
- **Header**: RYKE AI branding with doc metadata (version, constitution, phase, date, channel)
- **3 Personas**: Alex (Fitness Beginner), Maya (Nutrition Seeker), Jordan (Wellness User) — each with avatar, goals list, and color-coded role
- **7-Phase Timeline**: Discovery → Landing Page → Onboarding → First Conversation → Daily Coaching → Progress Moments → Long-term Retention — rendered as a connected horizontal track
- **Detailed Phase Cards**: Each phase has a phase number, icon, title, description, step list, principle badges, SLA pill, and a live SMS conversation mockup (CSS-only phone frame with realistic message bubbles)
- **Safety & Crisis Flow**: 4-step visual flow (Signal → Holding Message → Coach Alerted → Human Takeover) with example holding SMS and non-negotiable badge
- **Key Touchpoints Table**: 10 rows covering every interaction point with channel, actor, and latency SLA chips
- **Footer**: Constitution reference and doc metadata

Design matches the existing RYKE AI brand: dark (#080808), purple (#7c3aed / #a78bfa), cream (#f8f6f2), Cormorant Garamond headings, DM Sans body. Scroll-triggered fade-in animations included.

## Outcome

- ✅ Impact: Product stakeholders now have a visually rich, shareable HTML document mapping the complete RYKE AI user experience from discovery to long-term retention
- 🧪 Tests: Manual — open file in browser; verify all 7 phases, SMS mockups, safety flow, and table render correctly
- 📁 Files: project documents/rykeai-user-journey.html (created)
- 🔁 Next prompts: /sp.specify to create the MVP feature spec; use this journey doc as reference for acceptance criteria
- 🧠 Reflection: Constitution was the authoritative source for all principles referenced in the document (safety SLAs, zero-friction onboarding, one-question rule, token efficiency). SMS mockups were crafted to exactly match the AI behavior constraints defined in Principle IX.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): add persona-specific journey paths (separate journey trace per persona)
