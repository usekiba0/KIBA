---
id: "003"
title: RYKE AI MVP Phase 1 Task List
stage: tasks
date: 2026-04-29
surface: agent
model: claude-sonnet-4-6
feature: 001-sms-ai-coaching
branch: 001-sms-ai-coaching
user: Sumair Roudani
command: /sp.tasks
labels: ["tasks","nestjs","twilio","sendblue","stripe","claude-api","crisis-detection","mms","postgresql","redis","imessage"]
links:
  spec: specs/001-sms-ai-coaching/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - specs/001-sms-ai-coaching/tasks.md
tests:
  - see tasks.md for all contract and integration test tasks
---

## Prompt

/sp.tasks (run against branch 001-sms-ai-coaching)

## Response snapshot

Generated `specs/001-sms-ai-coaching/tasks.md` with 102 tasks across 9 phases covering all 6 user stories from the spec.

**Phase breakdown:**
- Phase 1 (Setup): T001–T008 — NestJS + Next.js scaffold, Docker Compose, CI, env config
- Phase 2 (Foundational): T009–T023 — All 8 TypeORM entities, migrations, DataModule, logger, exception filter
- Phase 3 (US1 Onboarding): T024–T045 — Stripe SetupIntent/Subscription, 5-step form, MessagingService (Twilio + SendBlue), welcome SMS
- Phase 4 (US2 Coaching): T046–T059 — TwilioWebhookGuard, SendBlueWebhookGuard, CoachingService, SessionCacheService, CoachingProcessor
- Phase 5 (US3 MMS): T060–T067 — VisionService, Claude Vision URL reference, NutritionalAnalysis persistence
- Phase 6 (US4 Context): T068–T075 — SummarisationService, session boundary, context reset, warm re-engagement
- Phase 7 (US5 Crisis): T076–T085 — CrisisService (Claude + BERT keyword fast-path), SafetyService, holding messages, coach alert, resume flow
- Phase 8 (US6 Data Rights): T086–T092 — Idempotency (Twilio + Stripe), data export, data deletion, Stripe cancellation
- Phase 9 (Polish): T093–T102 — Token logging, SLA monitoring, landing page conversion, health endpoint, load test

**43 of 102 tasks are parallelizable.**

MVP shippable at US1 + US2 completion (T001–T059).

## Outcome

- ✅ Impact: Fully actionable, dependency-ordered task list ready for /sp.implement
- 🧪 Tests: Contract tests (T044, T045, T058, T059, T066, T067, T085, T091, T092) and integration tests embedded in each user story phase
- 📁 Files: specs/001-sms-ai-coaching/tasks.md (102 tasks)
- 🔁 Next prompts: /sp.implement — begin executing tasks in order
- 🧠 Reflection: SendBlue integration woven into US1 (T033) and US2 (T047, T049, T050) as a parallel channel alongside Twilio. Crisis detection integrated into CoachingProcessor (T082) as an async BullMQ side-effect — zero latency impact on coaching replies.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): Format validation — all 102 tasks follow checklist format (checkbox + ID + optional P + optional Story + description with file path)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): Consider splitting T026 (OnboardingService) into sub-tasks for Stripe customer creation vs. User entity creation vs. welcome SMS queuing
