# Tasks: KIBA — Phase 1: SMS-First Psychological Accountability System

**Branch**: `001-sms-ai-coaching` | **Date**: 2026-05-09
**Input**: Design documents from `/specs/001-sms-ai-coaching/`
**Prerequisites**: plan.md ✅ spec.md ✅

**Format**: `- [ ] [TaskID] [P?] [USn] Description — file path`
**[P]** = parallelizable | **[USn]** = user story reference

---

## Phase 0 — Foundation

**Purpose**: Core infrastructure all user stories depend on. No feature code until this phase is complete.

- [x] T001 Bootstrap NestJS 10 backend with TypeScript in `backend/`
- [x] T002 Bootstrap Next.js 14 frontend with TypeScript and App Router in `frontend/`
- [x] T003 [P] Create `backend/docker-compose.yml` — PostgreSQL 15 + Redis 7 (ports 5432, 6379; named volumes)
- [x] T004 [P] Configure `ConfigModule.forRoot` + `TypeOrmModule.forRootAsync` + `BullModule.forRootAsync` in `backend/src/app.module.ts`
- [x] T005 Configure NestJS bootstrap in `backend/src/main.ts` — `rawBody: true`, `urlencoded`, `setGlobalPrefix('v1')`, global `ValidationPipe`, CORS with `FRONTEND_URL`
- [x] T006 Create structured logger utility in `backend/src/common/logger.ts` — JSON output with `service`, `operation`, `userId`, `durationMs` fields
- [x] T007 Create global HTTP exception filter in `backend/src/common/filters/http-exception.filter.ts`
- [x] T008 Set up GitHub Actions CI pipeline in `.github/workflows/ci.yml` — lint → unit → integration on push to master

**Checkpoint**: `docker-compose up -d` starts PG + Redis. `npm run start:dev` boots NestJS without errors.

---

## Phase 1 — Data Model

**Purpose**: All TypeORM entities and the initial database migration.

- [x] T009 [P] Create `User` entity in `backend/src/data/entities/user.entity.ts` — id (UUID PK), phone_number (UNIQUE), name, status (ENUM: trial/active/paused/cancelled), crisis_hold (BOOLEAN), checkin_time (TIME), timezone, registered_at, last_active_at
- [x] T010 [P] Create `Subscription` entity — id, user_id (FK), stripe_customer_id (UNIQUE), stripe_subscription_id (UNIQUE), status (ENUM: trialing/active/past_due/cancelled), trial_start, trial_end, current_period_end
- [ ] T011 [P] Create `PsychologicalProfile` entity in `backend/src/data/entities/psychological-profile.entity.ts` — id, user_id (FK UNIQUE), fears (TEXT), avoidance_patterns (TEXT), comparison_figure (TEXT), public_failure_scenario (TEXT), typical_failure_moment (TEXT), pressure_preference (ENUM: pressure/encouragement), created_at, updated_at
- [ ] T012 [P] Create `Goal` entity in `backend/src/data/entities/goal.entity.ts` — id, user_id (FK), description (TEXT), timeline (TEXT), current_status (TEXT), action_plan (JSONB), difficulty_level (INT 1–5 default 3), created_at, updated_at
- [ ] T013 [P] Create `DailyTask` entity in `backend/src/data/entities/daily-task.entity.ts` — id, goal_id (FK), user_id (FK), task_description (TEXT), scheduled_date (DATE), status (ENUM: pending/completed/missed/recovery), proof_id (nullable FK), completion_timestamp, created_at
- [ ] T014 [P] Create `Proof` entity in `backend/src/data/entities/proof.entity.ts` — id, task_id (FK), user_id (FK), proof_type (ENUM: photo/text), media_url (nullable), content (nullable TEXT), validation_status (ENUM: pending/accepted/rejected), validated_at, created_at
- [ ] T015 [P] Create `Strike` entity in `backend/src/data/entities/strike.entity.ts` — id, user_id (FK), daily_task_id (FK), escalation_level (INT: 1/2/3), created_at
- [ ] T016 [P] Create `ExecutionScore` entity in `backend/src/data/entities/execution-score.entity.ts` — id, user_id (FK), current_score (INT 0–100), completion_rate (DECIMAL), proof_rate (DECIMAL), response_time_score (DECIMAL), streak_bonus (DECIMAL), snapshot_date (DATE), created_at
- [ ] T017 [P] Create `AntiGhostState` entity in `backend/src/data/entities/anti-ghost-state.entity.ts` — user_id (FK PK), state (ENUM: active/ghost_1/ghost_2/ghost_3), last_response_at, next_escalation_at, current_job_id (nullable)
- [x] T018 [P] Create `ConversationSession` entity — id, user_id (FK), status (ENUM: active/completed/crisis_hold), started_at, last_message_at, ended_at
- [x] T019 [P] Create `Message` entity — id, session_id (FK), user_id (FK), role (ENUM: user/ai), message_type (ENUM: text/mms), content (TEXT), media_url, twilio_sid (UNIQUE nullable), is_checkin_prompt (BOOLEAN default false), is_proof_submission (BOOLEAN default false), created_at
- [x] T020 [P] Create `CrisisAlert` entity — id, user_id (FK), triggering_message_id (FK), detection_method (ENUM: keyword/ml_classifier), confidence_score, holding_message_sent (BOOLEAN), coach_alerted (BOOLEAN), status (ENUM: open/resolved), resolved_at
- [x] T021 [P] Create `SessionSummary` entity — id, user_id (FK), session_id (FK), summary (TEXT), created_at
- [x] T022 [P] Create `ProcessedStripeEvent` entity — stripe_event_id (PK), event_type, processed_at
- [ ] T023 Generate and run TypeORM migration covering all new entities — indexes: `phone_number` (unique on User), `user_id + scheduled_date` (compound on DailyTask), `user_id + snapshot_date` (compound on ExecutionScore), `user_id + created_at` (compound on Strike)
- [ ] T024 Update `DataModule` in `backend/src/data/data.module.ts` — export repositories for all new entities (PsychologicalProfile, Goal, DailyTask, Proof, Strike, ExecutionScore, AntiGhostState)

**Checkpoint**: `npm run migration:run` succeeds. All tables present in PostgreSQL with correct indexes.

---

## Phase 2 — Onboarding & Plan Generation (US1, US2)

**Goal**: User completes psychological onboarding form, pays, receives a personalised welcome SMS + structured action plan within 60 seconds.

**Independent Test**: Submit full form with Stripe test card → welcome SMS arrives on real phone in < 30s referencing stated goal or fear → action plan SMS sent within 60s → subscription record created with status `trialing`.

- [ ] T025 [P] [US1] Update `OnboardingFormDto` in `backend/src/onboarding/dto/onboarding-form.dto.ts` — add psychological intake fields: fears (IsNotEmpty), avoidance_patterns, comparison_figure, public_failure_scenario, typical_failure_moment, pressure_preference (IsEnum: pressure/encouragement); add goal_description, goal_timeline, current_status, checkin_time (IsString HH:MM format), timezone
- [ ] T026 [US1] Update `OnboardingService` in `backend/src/onboarding/onboarding.service.ts` — on successful submission: create User → create PsychologicalProfile → create Goal → create Stripe customer + subscription → queue welcome message; idempotent on phone_number
- [x] T027 [P] [US1] `StripeService` — `createCustomer`, `createSetupIntent`, `createSubscriptionWithTrial(customerId, paymentMethodId, priceId, trialDays)`, `cancelSubscription`, `getSubscription`
- [x] T028 [US1] `OnboardingController` — `POST /v1/onboarding/setup-intent`, `POST /v1/onboarding/submit`, `GET /v1/onboarding/check-phone`
- [x] T029 [US1] `StripeWebhookController` — handle `customer.subscription.created/updated/deleted`, `invoice.payment_failed/succeeded`, `customer.subscription.trial_will_end`; idempotency via ProcessedStripeEvent
- [ ] T030 [US1] Create `PlanService` in `backend/src/ai/plan.service.ts` — method: `generatePlan(user, psychProfile, goal): Promise<ActionPlan>` — calls Claude API with plan.prompt.ts; parses response into `{ milestones[], weekly_breakdown[], daily_tasks[] }` JSONB; saves to Goal entity
- [ ] T031 [US1] Create `plan.prompt.ts` in `backend/src/ai/prompts/plan.prompt.ts` — builds prompt injecting: goal description, timeline, current status, psychological profile (fears, avoidance, comparison figure); instructs Claude to generate milestones (3–5), weekly targets, and first 7 daily tasks; output in structured JSON
- [ ] T032 [US1] Update welcome SMS flow in `OnboardingService` — welcome message MUST reference user's stated goal AND one specific fear from psychological intake; tone adapts to pressure_preference
- [ ] T033 [US1] Queue plan generation job in `OnboardingService` — after welcome SMS is queued, add `plan-generation` job to BullMQ `accountability` queue with `{ userId, goalId }`; plan SMS sent as follow-up after generation completes
- [ ] T034 [US1] Update `OnboardingFormDto` frontend — add Step2 for psychological intake fields in `frontend/src/components/OnboardingForm/Step2PsychIntake.tsx` — questions: fears, avoidance, comparison_figure, public_failure_scenario, typical_failure_moment; pressure_preference radio (pressure/encouragement); all IsNotEmpty
- [x] T035 [P] [US1] Build `Step3Contact` (name + phone number) in `frontend/src/components/OnboardingForm/`
- [x] T036 [P] [US1] Build `Step4Payment` (Stripe Payment Element) in `frontend/src/components/OnboardingForm/`
- [x] T037 [US1] Build `OnboardingForm` orchestration page in `frontend/src/app/onboarding/page.tsx` — 4 steps with progress indicator; success state shows "Check your phone!"

**Checkpoint**: Full form → welcome SMS on real phone < 30s referencing fear → plan SMS < 60s → DB has User + PsychologicalProfile + Goal + Subscription records.

---

## Phase 3 — Daily Check-in & Proof System (US3)

**Goal**: KIBA proactively texts daily tasks. Users submit proof. Score updates. Non-response triggers anti-ghost.

**Independent Test**: Trigger manual check-in → submit proof photo via MMS → confirm score updates → skip a check-in → confirm anti-ghost follow-up arrives within 2 hours.

- [ ] T038 [US3] Create `AccountabilityModule` in `backend/src/accountability/accountability.module.ts` — imports DataModule, MessagingModule, AiModule; provides CheckinService, ProofService, StrikeService, ScoreService, AntiGhostService, PlanAdjustmentService
- [ ] T039 [US3] Create `CheckinService` in `backend/src/accountability/checkin.service.ts` — method: `scheduleCheckin(user, dailyTask): Promise<void>` — queues a BullMQ delayed job to fire at `user.checkin_time` on `task.scheduled_date`; stores job ID in AntiGhostState
- [ ] T040 [US3] Create `checkin.processor.ts` in `backend/src/accountability/checkin.processor.ts` — `@Process('send-checkin')` BullMQ worker: builds check-in message referencing specific task and demands proof; sends via MessagingService; updates AntiGhostState to `ghost_1` with 2h escalation job queued
- [ ] T041 [US3] Route inbound messages to correct handler in `coaching.processor.ts` — distinguish: (a) proof submission (MMS or contains proof keywords), (b) check-in response, (c) general coaching message; route accordingly
- [ ] T042 [US3] Create `ProofService` in `backend/src/accountability/proof.service.ts` — method: `processProof(user, dailyTask, message): Promise<void>` — if MMS: call VisionService to validate photo against task description; if text: accept as valid; create Proof entity; update DailyTask status to completed; call ScoreService.updateScore(user); cancel pending anti-ghost jobs; respond with pressure feedback referencing psychological profile
- [ ] T043 [US3] Update `VisionService` in `backend/src/ai/vision.service.ts` — add method: `validateProof(taskDescription, imageBuffer): Promise<{ valid: boolean, feedback: string }>` — Claude Vision prompt describes the task and asks if the image plausibly constitutes proof; lenient threshold (reject only clearly irrelevant images)
- [ ] T044 [US3] Update check-in prompt to inject psychological profile — check-in messages MUST reference: task name, user's stated goal, one psychological trigger (fear or comparison figure); never generic

**Checkpoint**: Manual check-in trigger → MMS proof submitted → DailyTask status = completed → ExecutionScore updated → anti-ghost job cancelled.

---

## Phase 4 — Strike System & Execution Score (US4)

**Goal**: Missed tasks log strikes. Score tracks performance. Both referenced in all AI messages.

- [ ] T045 [US4] Create `StrikeService` in `backend/src/accountability/strike.service.ts` — method: `logStrike(user, dailyTask, escalationLevel): Promise<Strike>` — creates Strike entity; logs structured event; updates DailyTask status to missed
- [ ] T046 [US4] Create `ScoreService` in `backend/src/accountability/score.service.ts` — method: `updateScore(user): Promise<ExecutionScore>` — calculates score from last 14 days: completion_rate (40%) + proof_rate (30%) + response_time_score (20%) + streak_bonus (10%); saves daily snapshot; logs structured event
- [ ] T047 [US4] Expose score in AI coaching prompt — update `coaching.prompt.ts` to inject: current execution score, strike count (last 7 days), current streak; AI MUST reference score or strikes when contextually relevant (not on every message)
- [ ] T048 [US4] Create `PlanAdjustmentService` in `backend/src/accountability/plan-adjustment.service.ts` — method: `checkAndAdjust(user): Promise<void>` — if score < 30 for 3+ consecutive days: reduce `goal.difficulty_level` by 1 (min 1); notify user via SMS; if score > 80 for 7+ consecutive days: increase difficulty_level by 1 (max 5); notify user
- [ ] T049 [US4] Handle "what's my score?" intent in coaching processor — detect score query intent; respond with exact score, what it reflects (e.g. "48/100 — you've completed 6 of your last 10 tasks"), and one specific next action

**Checkpoint**: Miss 2 check-ins → 2 Strike records created → ExecutionScore snapshot updated → next coaching message references strike count.

---

## Phase 5 — Anti-Ghosting System (US5)

**Goal**: Users cannot silently disappear. Three escalating follow-ups. Recovery task on return.

**Independent Test**: Ignore all KIBA messages for 48 hours → 3 escalating messages received, each referencing psychological profile → final message demands acknowledgement → respond to accept recovery task → normal flow resumes.

- [ ] T050 [US5] Create `AntiGhostService` in `backend/src/accountability/antighost.service.ts` — manages state machine transitions: `active` → `ghost_1` (2h) → `ghost_2` (24h) → `ghost_3` (48h); each transition queues BullMQ delayed job for next escalation and logs Strike at escalation_level matching state
- [ ] T051 [US5] Implement `ghost_1` escalation in AntiGhostService — message MUST reference: missed task, user's stated fear; tone: sharp and direct; ends with demand for immediate response
- [ ] T052 [US5] Implement `ghost_2` escalation in AntiGhostService — message MUST reference: comparison_figure, strike count, execution score trend; escalated tone; ends with explicit consequence statement
- [ ] T053 [US5] Implement `ghost_3` (recovery) in AntiGhostService — message MUST reference: original goal, public_failure_scenario, accumulated strike count; presents two options: "reply YES to accept a recovery task" or "reply RESET to start over"; normal flow blocked until one is chosen
- [ ] T054 [US5] Handle recovery task acceptance — on "YES" reply after ghost_3: generate recovery task via PlanService (simpler than current difficulty); create DailyTask with status recovery; resume normal check-in flow; send confirmation referencing original goal
- [ ] T055 [US5] Handle explicit reset — on "RESET" reply: clear strikes, log ExecutionScore reset event, restart goal plan from day 1 with same psychological profile, send reset confirmation referencing original goal and first new task
- [ ] T056 [US5] Reset anti-ghost state on any user response — in coaching.processor.ts: any inbound message from a ghost-state user cancels pending escalation jobs, transitions state back to `active`, logs the return

**Checkpoint**: 48h silence → 3 messages received with increasing pressure → "YES" reply → recovery task sent → AntiGhostState = active.

---

## Phase 6 — AI Coaching with Psychological Pressure (US7)

**Goal**: Every AI response uses the psychological profile. Generic responses are eliminated.

- [ ] T057 [US7] Rewrite `coaching.prompt.ts` in `backend/src/ai/prompts/coaching.prompt.ts` — new system prompt: AI is KIBA, an uncompromising accountability partner; inject psychological pressure context via `buildPressureContext()`; rules: 1–4 sentences, direct, no filler, ends with specific required action, adapts tone to pressure_preference but never softens accountability
- [ ] T058 [US7] Create `buildPressureContext(user, psychProfile, scoreSnapshot, recentStrikes)` function in `backend/src/ai/prompts/coaching.prompt.ts` — assembles psychological context string: goal, fears, comparison_figure, current score, recent strikes, public_failure_scenario (for high-pressure moments); injected into system prompt on every turn
- [ ] T059 [US7] Update `CoachingService` in `backend/src/ai/coaching.service.ts` — load PsychologicalProfile + latest ExecutionScore snapshot + strike count for every coaching request; pass to buildPressureContext; inject into prompt
- [ ] T060 [US7] Create `SessionCacheService` in `backend/src/data/session-cache.service.ts` — Redis sliding window of last 20 messages per user; TTL = SESSION_TIMEOUT_HOURS; methods: `getMessages(userId)`, `addMessage(userId, message)`, `clearMessages(userId)`
- [ ] T061 [US7] Create `SessionBoundaryService` in `backend/src/data/session-boundary.service.ts` — on session expiry: generate Claude summary (100–200 words) of the session via SummarisationService; save to SessionSummary entity; clear Redis cache for user
- [ ] T062 [US7] Update `SummarisationService` in `backend/src/ai/summarisation.service.ts` — summary prompt aware of KIBA context: summarises task completions, misses, emotional state, key commitments made; injected into next session as system prompt addition

**Checkpoint**: Coaching responses reference fear or comparison figure. Score and strikes visible in prompt. Session summaries generated on expiry.

---

## Phase 7 — Crisis Detection & Safety (US6)

**Goal**: Genuine distress triggers holding message < 3s, suspends pressure, alerts coach < 5 min.

- [x] T063 [US6] Create `CrisisService` in `backend/src/ai/crisis.service.ts` — hybrid detection: Claude API classifier (primary) + Transformers.js BERT (fast-path); threshold from `CRISIS_CONFIDENCE_THRESHOLD` env var
- [x] T064 [US6] Create `crisis.prompt.ts` — classification prompt; prompt caching for system prompt (~1500 tokens) to reduce cost
- [x] T065 [US6] Create `SafetyService` in `backend/src/safety/safety.service.ts` — on crisis detected: send holding message immediately (< 3s); set user.crisis_hold = true; queue `dispatch-coach-alert` BullMQ job; suspend all pressure responses
- [x] T066 [US6] Create `SafetyProcessor` in `backend/src/safety/safety.processor.ts` — `@Process('dispatch-coach-alert')`: send SMS alert to CRISIS_COACH_ALERT_PHONE and email to CRISIS_COACH_ALERT_EMAIL with user name, phone, triggering message, current plan context; update CrisisAlert entity
- [ ] T067 [US6] Ensure pressure is suspended during crisis hold — in coaching.processor.ts: if `user.crisis_hold = true` and no admin resolution: respond with supportive holding message only; do NOT send check-ins or anti-ghost escalations; do NOT log strikes during hold
- [x] T068 [US6] Admin crisis resolution endpoint — `POST /v1/admin/crisis/:id/resolve` — sets crisis_hold = false, marks CrisisAlert as resolved; resumes normal flow with gentle re-engagement message (not pressure)

**Checkpoint**: Send crisis keyword → holding message < 3s → user.crisis_hold = true → coach alert within 5 min → no pressure messages while in hold → admin resolve → gentle re-engagement.

---

## Phase 8 — iMessage (SendBlue) Integration

- [x] T069 [P] Implement SendBlue outbound in `MessagingService` — POST to SendBlue API with `sb-api-key-id` + `sb-api-secret-key` headers; auto SMS fallback if SendBlue unavailable
- [x] T070 [P] Add SendBlue inbound webhook controller — `POST /v1/webhooks/imessage`; parse SendBlue payload; route to same `coaching` BullMQ queue as Twilio inbound
- [x] T071 Channel-agnostic session context — iMessage and SMS share same ConversationSession, Strike, ExecutionScore, AntiGhostState for a given user

---

## Phase 9 — Admin Panel

- [x] T072 [P] Admin authentication — `x-internal-key` header guard; validates against `INTERNAL_API_KEY` env var
- [x] T073 [P] `GET /v1/admin/users` — paginated list with name, phone, status, subscription status
- [ ] T074 [P] Update `GET /v1/admin/users` — add execution_score, strike_count, current_plan_status to response
- [x] T075 [P] `GET /v1/admin/users/:id` — full user detail
- [ ] T076 [P] Update `GET /v1/admin/users/:id` — include psychological_profile, goal, recent_tasks, strike_history, score_history
- [x] T077 [P] `PATCH /v1/admin/users/:id/status` — suspend / reactivate
- [x] T078 [P] `GET /v1/admin/crisis` — open crisis alerts with user context
- [x] T079 `POST /v1/admin/crisis/:id/resolve` — resolve alert, resume normal flow
- [x] T080 [P] `GET /v1/admin/settings` + `PATCH /v1/admin/settings` — coach contact (email + phone)
- [x] T081 [P] `DELETE /v1/admin/users/:id/data` — GDPR full data deletion

---

## Phase 10 — Frontend: Landing Page & Onboarding

- [x] T082 [P] Landing page `frontend/src/app/page.tsx` — Kiba branding, pressure-focused hero copy, live SMS demo, FAQ, pricing
- [ ] T083 [P] Update landing page hero — replace fitness copy with Kiba accountability copy: positioning as "the system that makes ignoring goals impossible"; demo messages use psychological pressure tone
- [x] T084 [P] SMS demo components (`SmsDemo.tsx`, `SmsDemoLight.tsx`) — Kiba accountability demo messages
- [ ] T085 [US1] Build `Step2PsychIntake` onboarding component in `frontend/src/components/OnboardingForm/Step2PsychIntake.tsx` — 6 psychological intake questions; all required; tone: serious and direct (matches KIBA brand)
- [ ] T086 [US1] Update `Step1Goal` component — fields: goal description (textarea), timeline (select: 30 days / 60 days / 90 days / 6 months), current status (textarea), preferred check-in time (time picker)
- [x] T087 [P] `frontend/src/lib/api.ts` — typed API client for backend endpoints

---

## Phase 11 — Testing & CI

- [ ] T088 [P] Contract test: `backend/tests/contract/twilio.contract.spec.ts` — webhook signature validation, inbound SMS parsing
- [ ] T089 [P] Contract test: `backend/tests/contract/claude.contract.spec.ts` — coaching response shape, plan generation JSON shape, crisis classification output
- [ ] T090 [P] Contract test: `backend/tests/contract/stripe.contract.spec.ts` — webhook event handling, idempotency
- [ ] T091 [P] Contract test: `backend/tests/contract/postgres.contract.spec.ts` — all entity CRUD operations
- [ ] T092 Integration test: `backend/tests/integration/onboarding.integration.spec.ts` — full form submission → User + PsychologicalProfile + Goal + Subscription created → welcome SMS queued → plan generated
- [ ] T093 Integration test: `backend/tests/integration/checkin.integration.spec.ts` — check-in scheduled → sent at correct time → proof submitted → score updated → anti-ghost job cancelled
- [ ] T094 Integration test: `backend/tests/integration/proof.integration.spec.ts` — MMS proof submitted → VisionService validates → DailyTask completed → Proof entity created
- [ ] T095 Integration test: `backend/tests/integration/antighost.integration.spec.ts` — no response for 2h → ghost_1 message sent → no response 24h → ghost_2 → 48h → ghost_3 recovery → "YES" → recovery task → state = active
- [ ] T096 Integration test: `backend/tests/integration/strike-score.integration.spec.ts` — miss 3 tasks → 3 strikes → score recalculated → pressure messages reference strike count
- [ ] T097 Integration test: `backend/tests/integration/crisis-detection.integration.spec.ts` — crisis keyword → holding message < 3s → crisis_hold = true → coach alert < 5min → resolve → gentle resume
- [ ] T098 Unit test: `backend/tests/unit/score.service.spec.ts` — score formula edge cases (0 tasks, all missed, all completed with proof, mixed)
- [ ] T099 Unit test: `backend/tests/unit/antighost.service.spec.ts` — state machine transitions, job scheduling, reset on response
- [ ] T100 Unit test: `backend/tests/unit/coaching.service.spec.ts` — buildPressureContext output shape, psychological profile injection, prompt length within token budget

---

## Phase 12 — Deploy & Smoke Test

- [x] T101 Backend env vars set in Render dashboard — all required vars present and validated on startup
- [x] T102 Database connection verified — `GET /v1/health` returns 200 with DB status
- [ ] T103 Run database migrations on Render — `npm run migration:run` succeeds against production DB
- [ ] T104 Twilio webhook URL configured — `POST https://kiba-1.onrender.com/v1/webhooks/sms` set in Twilio console
- [ ] T105 Stripe webhook URL confirmed — `POST https://kiba-1.onrender.com/v1/stripe/webhook` active with correct events
- [ ] T106 End-to-end smoke test — complete onboarding form → welcome SMS on real phone < 30s referencing fear → plan SMS < 60s → reply to plan → coaching response referencing profile → manual check-in trigger → proof MMS → score update confirmed

---

## Dependency Order Summary

```
Phase 0 (Foundation)
  └── Phase 1 (Data Model)
        ├── Phase 2 (Onboarding + Plan) ──────────────────────┐
        ├── Phase 3 (Check-in + Proof) ← requires Phase 2     │
        ├── Phase 4 (Strikes + Score) ← requires Phase 3      │
        ├── Phase 5 (Anti-Ghost) ← requires Phase 4           │
        ├── Phase 6 (AI Pressure Coaching) ← requires Phase 2 │
        ├── Phase 7 (Crisis Safety) ← parallel with Phase 3   │
        ├── Phase 8 (iMessage) ← parallel with Phase 3        │
        ├── Phase 9 (Admin) ← parallel                        │
        └── Phase 10 (Frontend) ← parallel with Phase 2 ──────┘
              └── Phase 11 (Tests) ← requires all phases
                    └── Phase 12 (Deploy)
```
