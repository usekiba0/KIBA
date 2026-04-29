# Tasks: RYKE AI MVP — Phase 1: SMS-First AI Coaching

**Branch**: `001-sms-ai-coaching` | **Date**: 2026-04-29  
**Input**: Design documents from `/specs/001-sms-ai-coaching/`  
**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/ ✅

**Format**: `- [ ] [TaskID] [P?] [Story?] Description with file path`  
**[P]** = parallelizable | **[USn]** = user story label

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project scaffolding, tooling, and dev environment. No feature code.

- [x] T001 Initialise NestJS 10 backend project with TypeScript 5 in `backend/` — run `nest new backend`, configure `tsconfig.json` with strict mode
- [x] T002 Initialise Next.js 14 frontend project with TypeScript and App Router in `frontend/` — run `npx create-next-app@latest frontend --typescript --app`
- [x] T003 [P] Create `backend/docker-compose.yml` with PostgreSQL 15 and Redis 7 services (ports 5432, 6379; named volumes `postgres_data`, `redis_data`)
- [x] T004 [P] Create `backend/.env.example` with all required env vars: `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `SENDBLUE_API_KEY`, `SENDBLUE_SENDING_NUMBER`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_INDIVIDUAL`, `STRIPE_TRIAL_DAYS`, `ANTHROPIC_API_KEY`, `AI_MODEL`, `CRISIS_CONFIDENCE_THRESHOLD`, `CRISIS_COACH_ALERT_EMAIL`, `CRISIS_COACH_ALERT_PHONE`, `SESSION_TIMEOUT_HOURS`, `NODE_ENV`, `PORT`
- [x] T005 [P] Install backend dependencies: `@nestjs/typeorm typeorm pg ioredis @nestjs/bull bull @golevelup/nestjs-stripe stripe twilio @anthropic-ai/sdk @xenova/transformers class-validator class-transformer @nestjs/config`
- [x] T006 [P] Install frontend dependencies: `@stripe/stripe-js @stripe/react-stripe-js axios`
- [x] T007 [P] Configure ESLint + Prettier in `backend/.eslintrc.js` and `backend/.prettierrc`; configure same in `frontend/`
- [x] T008 [P] Set up GitHub Actions CI pipeline in `.github/workflows/ci.yml`: lint → unit tests → integration tests on push to `001-sms-ai-coaching` and PRs to main

**Checkpoint**: `docker-compose up -d` starts PostgreSQL + Redis. `npm run start:dev` boots NestJS. `npm run dev` boots Next.js.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that ALL user stories depend on. No user story work begins until this phase is complete.

**⚠️ CRITICAL**: Blocks all user story phases.

- [x] T009 Configure TypeORM in `backend/src/app.module.ts`: register `TypeOrmModule.forRootAsync` with `DATABASE_URL`, `synchronize: false`, `entities: [__dirname + '/**/*.entity{.ts,.js}']`
- [x] T010 Configure `ConfigModule.forRoot({ isGlobal: true })` and `BullModule.forRootAsync` (Redis connection from env) in `backend/src/app.module.ts`
- [x] T011 Configure NestJS bootstrap in `backend/src/main.ts`: `rawBody: true`, `app.use(express.urlencoded({ extended: false }))`, `app.setGlobalPrefix('v1')`, `ValidationPipe` globally
- [x] T012 [P] Create `User` TypeORM entity in `backend/src/data/entities/user.entity.ts` — fields: id (UUID PK), phone_number (VARCHAR 20 UNIQUE), name, coaching_focus (ENUM), goals (TEXT), height_cm, weight_kg, age, health_conditions (TEXT[]), dietary_restrictions (TEXT[]), injuries, status (ENUM: trial/active/paused/cancelled), crisis_hold (BOOLEAN default false), registered_at, last_active_at
- [x] T013 [P] Create `Subscription` TypeORM entity in `backend/src/data/entities/subscription.entity.ts` — fields: id (UUID PK), user_id (FK), stripe_customer_id (UNIQUE), stripe_subscription_id (UNIQUE), plan (ENUM), status (ENUM: trialing/active/past_due/cancelled), trial_start, trial_end, current_period_end, created_at, updated_at
- [x] T014 [P] Create `ConversationSession` TypeORM entity in `backend/src/data/entities/conversation-session.entity.ts` — fields: id (UUID PK), user_id (FK), status (ENUM: active/completed/crisis_hold), message_count (INT default 0), summary_generated (BOOLEAN), started_at, last_message_at, ended_at
- [x] T015 [P] Create `Message` TypeORM entity in `backend/src/data/entities/message.entity.ts` — fields: id (UUID PK), session_id (FK), user_id (FK), role (ENUM: user/ai), message_type (ENUM: text/mms), content (TEXT), media_url, media_content_type, twilio_sid (UNIQUE nullable), token_count (nullable), created_at
- [x] T016 [P] Create `NutritionalAnalysis` TypeORM entity in `backend/src/data/entities/nutritional-analysis.entity.ts` — fields: id (UUID PK), message_id (FK UNIQUE), user_id (FK), detected_foods (TEXT[]), total_calories, protein_grams, carbs_grams, fat_grams, health_flags (TEXT[]), recommendation, confidence_score (DECIMAL 4,3), food_identified (BOOLEAN), created_at
- [x] T017 [P] Create `CrisisAlert` TypeORM entity in `backend/src/data/entities/crisis-alert.entity.ts` — fields: id (UUID PK), user_id (FK), triggering_message_id (FK), detection_method (ENUM: keyword/ml_classifier/hybrid), confidence_score, holding_message_sent (BOOLEAN), holding_message_sent_at, coach_alerted (BOOLEAN), coach_alerted_at, coach_alert_channel (ENUM: sms/email), status (ENUM: open/acknowledged/resolved), resolved_by, resolved_at, created_at
- [x] T018 [P] Create `SessionSummary` TypeORM entity in `backend/src/data/entities/session-summary.entity.ts` — fields: id (UUID PK), user_id (FK), session_id (FK), summary (TEXT), message_count_summarised, trigger (ENUM: session_expiry/message_count/token_budget), created_at
- [x] T019 [P] Create `ProcessedStripeEvent` TypeORM entity in `backend/src/data/entities/processed-stripe-event.entity.ts` — fields: stripe_event_id (VARCHAR 50 PK), event_type, processed_at
- [x] T020 Generate and run initial TypeORM migration in `backend/src/data/migrations/` — creates all 8 entity tables with indexes: `phone_number` (unique), `user_id + created_at` (compound on messages), `twilio_sid` (unique on messages)
- [x] T021 Create `DataModule` in `backend/src/data/data.module.ts` — exports TypeORM repositories for all 8 entities; imports `TypeOrmModule.forFeature([...all entities])`
- [x] T022 Create structured logger utility in `backend/src/common/logger.ts` — wraps NestJS Logger with JSON-structured output including `service`, `operation`, `userId`, `durationMs`, `tokenCount` fields
- [x] T023 Create global exception filter in `backend/src/common/filters/http-exception.filter.ts` — logs all unhandled exceptions with structured logger; returns consistent `{ statusCode, message, error }` shape

**Checkpoint**: All entity tables exist in PostgreSQL. `npm run migration:run` succeeds. Logger and exception filter wired globally.

---

## Phase 3: User Story 1 — Web Onboarding & Free Trial Signup (Priority: P1) 🎯 MVP Entry Gate

**Goal**: User completes a 5-step web form, pays with Stripe (free trial), and receives a personalised welcome SMS/iMessage within 30 seconds.

**Independent Test**: Complete the full onboarding form with a Stripe test card → welcome SMS arrives on a real phone in < 30s referencing the user's stated goal → subscription record created with status `trialing`.

### Implementation

- [x] T024 [P] [US1] Create `OnboardingFormDto` in `backend/src/onboarding/dto/onboarding-form.dto.ts` — class-validator decorators for all fields: name, phone_number (IsPhoneNumber E.164), coaching_focus (IsEnum), goals (IsNotEmpty), height_cm, weight_kg, age, health_conditions (IsArray), dietary_restrictions (IsArray), injuries, stripe_payment_method_id (IsNotEmpty), plan (IsEnum default individual)
- [x] T025 [P] [US1] Create `StripeService` in `backend/src/onboarding/stripe.service.ts` — methods: `createCustomer(name, email?)`, `createSetupIntent(customerId)`, `createSubscriptionWithTrial(customerId, paymentMethodId, priceId, trialDays)`, `cancelSubscription(subscriptionId)`, `getSubscription(subscriptionId)`; inject `ConfigService` for keys
- [x] T026 [US1] Create `OnboardingService` in `backend/src/onboarding/onboarding.service.ts` — orchestrates: validate phone → create Stripe customer → create subscription with trial → create User entity → create Subscription entity → queue welcome message; idempotent on `phone_number` (return existing user if found)
- [x] T027 [US1] Create `OnboardingController` in `backend/src/onboarding/onboarding.controller.ts` — routes: `POST /v1/onboarding/setup-intent` (returns client_secret), `POST /v1/onboarding/submit` (calls OnboardingService, returns OnboardingSubmitResponse); apply ValidationPipe to body
- [x] T028 [US1] Create `StripeWebhookController` in `backend/src/onboarding/stripe-webhook.controller.ts` — route: `POST /v1/webhooks/stripe`; validate Stripe-Signature header using `stripe.webhooks.constructEvent`; handle events: `customer.subscription.created`, `customer.subscription.trial_will_end`, `customer.subscription.updated`, `invoice.payment_failed`, `invoice.payment_succeeded`, `customer.subscription.deleted`; idempotency via `ProcessedStripeEvent` table
- [x] T029 [US1] Add welcome message queue job in `OnboardingService` — on `customer.subscription.created` webhook: look up user, build personalised welcome message referencing user.goals and user.coaching_focus, add to BullMQ `messaging` queue with `{ to: user.phone_number, body: welcomeText, type: 'welcome' }`
- [x] T030 [US1] Create `MessagingModule` scaffold in `backend/src/messaging/messaging.module.ts` — register BullMQ queues: `messaging` (outbound), `coaching` (inbound processing); export `MessagingService`
- [x] T031 [US1] Create `MessagingService` in `backend/src/messaging/messaging.service.ts` — method: `send(to: string, body: string): Promise<void>` — detects if destination supports iMessage via SendBlue API lookup, routes to `sendViaSendBlue(to, body)` or `sendViaTwilio(to, body)`; both wrapped with 3-attempt exponential backoff (2s base)
- [x] T032 [US1] Implement Twilio outbound in `MessagingService` — `sendViaTwilio(to, body)`: calls `twilioClient.messages.create({ from: TWILIO_PHONE_NUMBER, to, body })`; logs `{ service: 'messaging', operation: 'send_sms', to, sid }`
- [x] T033 [US1] Implement SendBlue outbound in `MessagingService` — `sendViaSendBlue(to, body)`: POST to SendBlue API `https://api.sendblue.co/api/send-message` with `{ number: to, content: body }`; auth via `sb-api-key-id` + `sb-api-secret-key` headers; log result
- [x] T034 [US1] Create `MessagingProcessor` in `backend/src/messaging/messaging.processor.ts` — `@Process('send-message')` BullMQ worker: calls `MessagingService.send(job.data.to, job.data.body)`; retry on failure
- [x] T035 [US1] Create `OnboardingModule` in `backend/src/onboarding/onboarding.module.ts` — imports `DataModule`, `MessagingModule`, `BullModule.registerQueue({ name: 'messaging' })`, `@golevelup/nestjs-stripe`; provides `OnboardingService`, `StripeService`
- [x] T036 [P] [US1] Build Next.js onboarding form `Step1Goals` component in `frontend/src/components/OnboardingForm/Step1Goals.tsx` — fields: coaching_focus (radio: fitness/nutrition/wellness/combined), goals (textarea); local state + onNext callback
- [x] T037 [P] [US1] Build `Step2BodyMetrics` component in `frontend/src/components/OnboardingForm/Step2BodyMetrics.tsx` — fields: height_cm (number), weight_kg (number), age (number); all optional; onNext/onBack callbacks
- [x] T038 [P] [US1] Build `Step3HealthInfo` component in `frontend/src/components/OnboardingForm/Step3HealthInfo.tsx` — fields: health_conditions (tag input), dietary_restrictions (tag input), injuries (textarea optional)
- [x] T039 [P] [US1] Build `Step4Contact` component in `frontend/src/components/OnboardingForm/Step4Contact.tsx` — fields: name (text), phone_number (tel, E.164 format hint); phone validation before onNext
- [x] T040 [US1] Build `Step5Payment` component in `frontend/src/components/OnboardingForm/Step5Payment.tsx` — integrates Stripe Payment Element; on mount: call `POST /v1/onboarding/setup-intent` to get client_secret; on submit: call `stripe.confirmSetupIntent(clientSecret, { elements })`; on success: call `POST /v1/onboarding/submit` with full form data + payment_method_id
- [x] T041 [US1] Build `OnboardingForm` page in `frontend/src/app/onboarding/page.tsx` — orchestrates Steps 1–5 with progress indicator; handles step state, validation, and final submission; shows success state with "Check your phone!" message on completion
- [x] T042 [US1] Create `frontend/src/lib/stripe.ts` — initialises `loadStripe(NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)` and exports stripe instance; wrap with `Elements` provider in `Step5Payment`
- [x] T043 [US1] Create `frontend/src/lib/api.ts` — typed axios wrapper for backend calls: `createSetupIntent(name, phone)`, `submitOnboarding(formData)`; base URL from `NEXT_PUBLIC_API_URL`
- [x] T044 [US1] Write contract test in `backend/tests/contract/stripe.contract.spec.ts` — verifies: SetupIntent creation returns client_secret; Subscription creation with trial returns status `trialing`; uses Stripe test mode
- [x] T045 [US1] Write integration test in `backend/tests/integration/onboarding.integration.spec.ts` — full flow: POST `/v1/onboarding/submit` → User created in DB → Subscription created → welcome message queued in BullMQ → message dispatched within 30s; uses real PostgreSQL (Docker), Twilio test credentials

**Checkpoint**: Full onboarding flow works end-to-end. Stripe test card → User + Subscription records in DB → welcome SMS received on a real phone in < 30s.

---

## Phase 4: User Story 2 — SMS/iMessage AI Coaching (Priority: P2)

**Goal**: A registered user texts the RYKE AI number and receives a personalised, context-aware coaching reply within 10 seconds.

**Independent Test**: Text the Twilio/SendBlue number from a registered phone → AI responds within 10 seconds with a 1–4 sentence response referencing the user's onboarding profile and containing one actionable item.

### Implementation

- [x] T046 [P] [US2] Create `TwilioWebhookDto` in `backend/src/messaging/dto/twilio-webhook.dto.ts` — typed class for Twilio POST body: From, To, Body, SmsMessageSid, NumMedia, MediaUrl0, MediaContentType0
- [x] T047 [P] [US2] Create `SendBlueWebhookDto` in `backend/src/messaging/dto/sendblue-webhook.dto.ts` — typed class for SendBlue inbound webhook: number (sender), content, date_sent, message_handle, was_downgraded
- [x] T048 [US2] Create `TwilioWebhookGuard` in `backend/src/messaging/guards/twilio-webhook.guard.ts` — implements `CanActivate`; calls `twilio.validateRequest(authToken, signature, fullUrl, body)`; throws `UnauthorizedException` on invalid signature; requires `express.urlencoded` middleware
- [x] T049 [US2] Create `SendBlueWebhookGuard` in `backend/src/messaging/guards/sendblue-webhook.guard.ts` — validates `sb-api-key-id` header matches configured SendBlue key; throws `UnauthorizedException` on mismatch
- [x] T050 [US2] Create `MessagingController` in `backend/src/messaging/messaging.controller.ts` — routes: `POST /v1/webhooks/sms` (guarded by TwilioWebhookGuard), `POST /v1/webhooks/imsg` (guarded by SendBlueWebhookGuard); both: store raw message to DB, respond with empty 200 immediately, add to BullMQ `coaching` queue; deduplicate on `twilio_sid`
- [x] T051 [US2] Create `CoachingPrompt` in `backend/src/ai/prompts/coaching.prompt.ts` — exports `buildSystemPrompt(user: User, sessionSummary?: string): string` — constructs system prompt with: coach persona, user profile (name, goals, coaching_focus, body metrics, health conditions, dietary restrictions), session summary if present; target < 300 tokens
- [x] T052 [US2] Create `CoachingService` in `backend/src/ai/coaching.service.ts` — method: `generateReply(user: User, recentMessages: Message[], incomingText: string): Promise<string>`; builds Claude API `messages.create` call with: model from `AI_MODEL` env, system prompt from `CoachingPrompt`, conversation window from `recentMessages`, user message; logs token usage; returns response text
- [x] T053 [US2] Create `SessionCacheService` in `backend/src/data/session-cache.service.ts` — methods: `getSessionWindow(userId): Promise<{messages, source}>` (Redis first, PostgreSQL fallback); `addMessage(userId, role, content)` (write to PostgreSQL + append to Redis); `invalidateSession(userId)` (delete Redis key); Redis key pattern `session:{userId}`, TTL = `SESSION_TIMEOUT_HOURS * 3600`
- [x] T054 [US2] Create `SessionBoundaryService` in `backend/src/data/session-boundary.service.ts` — method: `checkAndHandle(userId): Promise<SessionBoundary>` — detects if current session has expired (last_message_at + SESSION_TIMEOUT_HOURS < now); on expiry: mark session `completed`, call `SummarisationService.summarise(userId)`, create new ConversationSession; returns `{ isNewSession, minutesSinceLastMessage }`
- [x] T055 [US2] Create `CoachingProcessor` in `backend/src/messaging/coaching.processor.ts` — `@Process('process-coaching-message')` BullMQ worker: (1) look up user by phone, (2) check `user.crisis_hold` — if true, skip and send holding variant, (3) check session boundary, (4) load session window from `SessionCacheService`, (5) call `CoachingService.generateReply`, (6) save AI reply to DB + Redis, (7) add outbound message to `messaging` queue via `MessagingService`
- [x] T056 [US2] Handle unregistered sender in `CoachingProcessor` — if user not found by phone: send "Welcome! Sign up at ryke.ai to start your free coaching trial." via `MessagingService`; do not process through AI
- [x] T057 [US2] Create `AiModule` in `backend/src/ai/ai.module.ts` — provides `CoachingService`; imports `DataModule`; exports `CoachingService`
- [x] T058 [US2] Write contract test in `backend/tests/contract/twilio.contract.spec.ts` — verifies: webhook POST body shape (From, Body, NumMedia, SmsMessageSid); signature validation accepts valid signature, rejects invalid; outbound `messages.create` call succeeds with test credentials
- [x] T059 [US2] Write integration test in `backend/tests/integration/sms-coaching.integration.spec.ts` — POST to `/v1/webhooks/sms` with valid Twilio signature → message stored in DB → coaching queue job created → Claude API called → outbound SMS sent → full round-trip under 10s

**Checkpoint**: Text the RYKE AI number → contextual coaching reply arrives within 10 seconds, referencing the user's onboarding profile.

---

## Phase 5: User Story 3 — MMS Photo Nutrition Analysis (Priority: P3)

**Goal**: User sends a food photo via MMS → AI returns calorie count, macro breakdown, and dietary recommendation within 15 seconds.

**Independent Test**: Send an MMS with a food photo to the Twilio number → response received within 15 seconds containing calories, protein/carbs/fat, and a recommendation. Unidentifiable food returns a graceful retry message.

### Implementation

- [x] T060 [P] [US3] Create `VisionPrompt` in `backend/src/ai/prompts/vision.prompt.ts` — exports `buildNutritionPrompt(user: User): string` — instructs Claude to return structured JSON with fields: detected_foods, total_calories, macronutrients (protein_grams, carbs_grams, fat_grams), health_condition_flags, dietary_recommendation; injects user health conditions; target < 200 tokens
- [x] T061 [US3] Create `VisionService` in `backend/src/ai/vision.service.ts` — method: `analyseFood(mediaUrl: string, user: User): Promise<NutritionResult>` — builds Claude API call with image URL reference (`{ type: 'image', source: { type: 'url', url: mediaUrl } }`), model `claude-haiku-4-5`, `temperature: 0`, max_tokens 500; parses JSON response into `NutritionResult`; handles `food_identified: false` case; logs token usage
- [x] T062 [US3] Add MMS detection and routing in `CoachingProcessor` — check `job.data.mediaUrls.length > 0` AND `MediaContentType` starts with `image/`; if MMS with image: call `VisionService.analyseFood(mediaUrl, user)` and format nutrition reply; if no food detected: return graceful message "I couldn't identify a meal in that photo — try a clearer shot with better lighting?"
- [x] T063 [US3] Persist `NutritionalAnalysis` entity after each successful food analysis in `CoachingProcessor` — save detected_foods, calories, macros, health_flags, recommendation, confidence_score, food_identified to `NutritionalAnalysis` repository linked to the triggering message
- [x] T064 [US3] Format nutrition SMS reply in `CoachingProcessor` — compose message: `"{recommendation}\n\nNutrition: ~{calories} cal | {protein}g protein / {carbs}g carbs / {fat}g fat"` — ensure total length ≤ 160 chars; split into two SMS if needed
- [x] T065 [US3] Add `VisionService` to `AiModule` — provide and export in `backend/src/ai/ai.module.ts`
- [x] T066 [US3] Write contract test in `backend/tests/contract/claude.contract.spec.ts` — verifies: Claude API `messages.create` with image URL returns valid JSON nutrition object; model `claude-haiku-4-5` accessible; invalid image URL returns graceful error
- [x] T067 [US3] Write integration test in `backend/tests/integration/mms-nutrition.integration.spec.ts` — POST to `/v1/webhooks/sms` with NumMedia=1 and MediaUrl0 pointing to a test food image URL → `NutritionalAnalysis` entity created in DB → nutrition reply sent within 15 seconds

**Checkpoint**: Send food photo MMS → calorie/macro reply within 15s. Non-food image → graceful retry message. Health conditions reflected in flags.

---

## Phase 6: User Story 4 — Context-Aware Coaching Across Sessions (Priority: P4)

**Goal**: Returning users find the AI remembers their goals and coaching history across session boundaries — no re-introduction needed.

**Independent Test**: Send messages, wait for session to expire (or manually expire via TTL), send a new message → AI response references the user's previously stated goal without being prompted.

### Implementation

- [x] T068 [US4] Create `SummarisationPrompt` in `backend/src/ai/prompts/summarisation.prompt.ts` — exports `buildSummarisationPrompt(messages: Message[]): string` — instructs Claude to summarise into 100–200 words capturing: goals, progress, challenges, user communication style, commitments, health metrics; input is formatted conversation history
- [x] T069 [US4] Create `SummarisationService` in `backend/src/ai/summarisation.service.ts` — method: `summariseSession(userId: string, sessionId: string): Promise<string>` — fetches messages for the session from `MessageRepository`, calls Claude API with `SummarisationPrompt`, saves result to `SessionSummary` entity, marks `ConversationSession.summary_generated = true`; uses `claude-haiku-4-5`, max_tokens 400
- [x] T070 [US4] Integrate `SummarisationService` into `SessionBoundaryService.checkAndHandle` — on session expiry: call `SummarisationService.summariseSession`, then mark old session `completed` and `ended_at = now()`; create new `ConversationSession` for the user
- [x] T071 [US4] Add summarisation-triggered boundary to `SessionBoundaryService` — trigger summary when `message_count >= 30` OR estimated token usage reaches 75% of 200k limit (estimate: message_count * 400 tokens); call `SummarisationService` and reset Redis TTL
- [x] T072 [US4] Load session summary into `CoachingPrompt` — in `CoachingProcessor`: after `SessionBoundaryService.checkAndHandle`, if `isNewSession = true`, fetch latest `SessionSummary` for user from DB; pass to `buildSystemPrompt(user, summary.summary)`; summary injected after user profile block
- [x] T073 [US4] Implement context reset handler in `CoachingProcessor` — detect reset intent (e.g. user sends "reset my coaching" or "start fresh"); invalidate Redis session key; do NOT delete `SessionSummary` or user onboarding profile; send confirmation: "Done — fresh start! Your profile and goals are still saved. What would you like to work on?"
- [x] T074 [US4] Add warm re-engagement prefix to coaching prompt when `isNewSession = true` and `minutesSinceLastMessage > 240` — prepend instruction to `CoachingPrompt`: "Acknowledge warmly that some time has passed since the last conversation before giving coaching advice"
- [x] T075 [US4] Add `SummarisationService` to `AiModule` in `backend/src/ai/ai.module.ts` — provide and export

**Checkpoint**: After a 4-hour gap, send a new message → AI warmly acknowledges the break and references the prior session context from the generated summary.

---

## Phase 7: User Story 5 — ML-Based Crisis Detection & Human Handoff (Priority: P5)

**Goal**: Distress signals (explicit or ML-detected) trigger an immediate holding message to the user and a coach alert within 5 minutes. AI coaching is suspended until coach resolves the alert.

**Independent Test**: Send a message with known crisis language → holding message received within 3 seconds → `CrisisAlert` record created → coach alert dispatched within 5 minutes → `user.crisis_hold = true` → subsequent messages return holding message variant, not coaching reply.

### Implementation

- [x] T076 [P] [US5] Create keyword pre-filter in `backend/src/safety/crisis-keywords.ts` — export `HIGH_RISK_KEYWORDS: string[]` list (e.g. "kill myself", "end my life", "suicide", "want to die", "hurt myself", "self harm", "can't go on"); export `containsHighRiskKeyword(text: string): boolean`
- [x] T077 [P] [US5] Create `CrisisPrompt` in `backend/src/ai/prompts/crisis.prompt.ts` — exports cached system prompt (~1500 tokens) for Claude crisis classifier: classifies message on 8 dimensions (abuse, self-harm, suicide, substance, eating disorder, psychosis, violence, grief/hopelessness); returns JSON `{ crisis: boolean, confidence: number, dimension: string, reasoning: string }`; designed for prompt caching with `cache_control: { type: 'ephemeral' }` on system block
- [x] T078 [US5] Create `CrisisService` in `backend/src/ai/crisis.service.ts` — method: `classify(text: string): Promise<CrisisResult>` — (1) run `containsHighRiskKeyword(text)` → if true, return `{ crisis: true, confidence: 0.95, method: 'keyword' }` without API call; (2) call Claude API with cached `CrisisPrompt`; parse JSON response; return `{ crisis, confidence, dimension, method: 'ml_classifier' }`; log token usage with cache hit rate
- [x] T079 [US5] Create `SafetyService` in `backend/src/safety/safety.service.ts` — method: `handleCrisisDetection(userId: string, messageId: string, result: CrisisResult): Promise<void>` — (1) set `user.crisis_hold = true`, (2) set `session.status = 'crisis_hold'`, (3) create `CrisisAlert` entity (status: open), (4) queue holding message via `MessagingService` immediately, (5) queue coach alert job to BullMQ `crisis-detection` queue
- [x] T080 [US5] Create `HOLDING_MESSAGES` constant in `backend/src/safety/holding-messages.ts` — array of 3 supportive holding message variants; export `getHoldingMessage(): string` (random selection); include 988 crisis line reference; messages must not exceed 160 chars
- [x] T081 [US5] Create `SafetyProcessor` in `backend/src/safety/safety.processor.ts` — `@Process('dispatch-coach-alert')` BullMQ worker: send SMS via `MessagingService` to `CRISIS_COACH_ALERT_PHONE` with alert body: "RYKE AI ALERT: User [userId] sent a distress signal at [timestamp]. Message: [snippet]. Please respond."; send email via nodemailer to `CRISIS_COACH_ALERT_EMAIL`; update `CrisisAlert.coach_alerted = true`, `coach_alerted_at = now()`; log SLA time (must be < 5 min from `created_at`)
- [x] T082 [US5] Integrate crisis classification into `CoachingProcessor` — BEFORE generating coaching reply: add message to BullMQ `crisis-detection` queue for async classification; if `user.crisis_hold = true` (already flagged): skip AI, send holding message variant immediately
- [x] T083 [US5] Create `SafetyModule` in `backend/src/safety/safety.module.ts` — imports `DataModule`, `MessagingModule`, `AiModule`, `BullModule.registerQueue({ name: 'crisis-detection' })`; provides `SafetyService`, `SafetyProcessor`
- [x] T084 [US5] Add crisis resume logic — create `POST /v1/safety/alerts/:alertId/resolve` endpoint in a `SafetyController`; sets `CrisisAlert.status = 'resolved'`, `resolved_by`, `resolved_at`; sets `user.crisis_hold = false`; sets `session.status = 'active'`; sends re-engagement SMS to user: "Your coach has checked in. I'm here whenever you're ready to continue."
- [x] T085 [US5] Write integration test in `backend/tests/integration/crisis-detection.integration.spec.ts` — (1) send message with keyword → holding message received < 3s → `CrisisAlert` created → `user.crisis_hold = true`; (2) send subtle distress messages (3x) → ML classifier fires → same flow; (3) resolve alert via API → `crisis_hold = false` → normal coaching resumes

**Checkpoint**: Send "I want to hurt myself" → holding message arrives in < 3s → CrisisAlert in DB → coach alert SMS/email within 5 minutes → user.crisis_hold = true → subsequent messages return holding variant.

---

## Phase 8: User Story 6 — Conversation History Storage & Data Rights (Priority: P6)

**Goal**: All messages and user data are durably stored. Users can export or delete all their data on request.

**Independent Test**: Send 10 messages → verify all stored in DB with correct metadata → submit data deletion request → all user records purged within the request cycle → subscription cancelled in Stripe.

### Implementation

- [x] T086 [P] [US6] Implement Stripe webhook idempotency in `StripeWebhookController` — on every event: INSERT INTO `processed_stripe_events` (stripe_event_id, event_type); if UNIQUE constraint violation (duplicate event), return 200 without processing; ensures exactly-once delivery
- [x] T087 [P] [US6] Implement Twilio webhook idempotency in `MessagingController` — on inbound SMS: check `messages` table for existing `twilio_sid`; if found, return 200 immediately without re-queuing; prevents duplicate processing on Twilio retries
- [x] T088 [US6] Create `DataRightsService` in `backend/src/data/data-rights.service.ts` — method: `exportUserData(userId: string): Promise<UserDataExport>` — fetches user, subscription, all messages, all nutritional analyses, all session summaries, all crisis alerts; returns structured JSON object
- [x] T089 [US6] Create `DataRightsService.deleteUserData(userId: string): Promise<void>` — in a DB transaction: delete all messages, nutritional analyses, session summaries, crisis alerts, conversation sessions for user; cancel Stripe subscription via `StripeService.cancelSubscription`; delete subscription record; delete user record; log deletion event with timestamp
- [x] T090 [US6] Create `DataRightsController` in `backend/src/data/data-rights.controller.ts` — routes: `GET /v1/users/:userId/export` (returns JSON export), `DELETE /v1/users/:userId` (calls deleteUserData, returns 204); add basic auth guard (userId must match request context or admin key)
- [x] T091 [US6] Write contract test in `backend/tests/contract/postgres.contract.spec.ts` — verifies: all 8 entity tables exist with correct columns; foreign key constraints enforced; UNIQUE index on `messages.twilio_sid` prevents duplicates; UUID primary keys generated correctly
- [x] T092 [US6] Write integration test for data rights — POST 5 messages for a user → GET export → verify all 5 messages present → DELETE user → verify user + all related records gone from DB → Stripe subscription cancelled

**Checkpoint**: Data export returns all user records as JSON. Data deletion removes everything and cancels Stripe subscription.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Observability, hardening, performance validation, and launch readiness.

- [x] T093 [P] Add token usage logging to all AI service calls — in `CoachingService`, `VisionService`, `CrisisService`, `SummarisationService`: after each Claude API call, log `{ service, operation, userId, inputTokens, outputTokens, cacheReadTokens, totalTokens, model }`; warn if `inputTokens + outputTokens > 500` on coaching turns
- [x] T094 [P] Add crisis SLA monitoring to `SafetyProcessor` — after dispatching coach alert, compute `slaMs = Date.now() - crisisAlert.created_at.getTime()`; if `slaMs > 300000` (5 min): log `ERROR { operation: 'crisis_sla_breach', userId, slaMs }` — this is the observable hook for future alerting
- [x] T095 Convert existing landing page HTML to Next.js in `frontend/src/app/page.tsx` — migrate `project documents/rykeai-website-v4 new.html` to React components; preserve all styles, animations, and CTA button; CTA links to `/onboarding`
- [x] T096 [P] Add `SENDBLUE_API_KEY` and `SENDBLUE_SENDING_NUMBER` to `backend/.env.example` and to `backend/src/common/config/configuration.ts` — validate on startup that both are present; log warning if missing (graceful degradation to SMS-only)
- [x] T097 Write `backend/tests/unit/coaching.service.spec.ts` — unit tests for `CoachingService.generateReply`: mocks Claude client; verifies system prompt contains user name and goals; verifies response stays within 4 sentences; verifies one question max
- [x] T098 Write `backend/tests/unit/crisis.service.spec.ts` — unit tests for `CrisisService.classify`: keyword fast-path returns confidence 0.95 without API call; ML path parses Claude JSON response correctly; handles malformed JSON gracefully
- [x] T099 Write `backend/tests/unit/session-cache.service.spec.ts` — unit tests for `SessionCacheService`: Redis hit returns cached messages; Redis miss loads from PostgreSQL and writes back; `addMessage` appends to Redis and persists to DB; TTL is set on every write
- [ ] T100 [P] Create `backend/src/common/health/health.controller.ts` — `GET /v1/health` endpoint: checks PostgreSQL connection, Redis connection, Twilio API reachability; returns `{ status: 'ok' | 'degraded', checks: {...} }` — used by AWS load balancer health check
- [ ] T101 Run full end-to-end validation against staging per `specs/001-sms-ai-coaching/quickstart.md` — execute all 3 test scripts: onboarding flow, crisis detection, MMS nutrition; verify all SLAs on real devices (smartphone + basic feature phone)
- [ ] T102 Load test staging: send 50 concurrent inbound webhook requests using `autocannon` or `k6`; verify p95 coaching reply latency < 10s; verify no message queue backlog > 100 jobs; fix any bottlenecks found

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)           → No dependencies — start immediately
Phase 2 (Foundational)    → Depends on Phase 1 — BLOCKS all user stories
Phase 3 (US1 Onboarding)  → Depends on Phase 2 — first user story, entry gate
Phase 4 (US2 Coaching)    → Depends on Phase 2 + Phase 3 (MessagingModule scaffold from T030)
Phase 5 (US3 MMS)         → Depends on Phase 4 (CoachingProcessor routing)
Phase 6 (US4 Context)     → Depends on Phase 4 (SessionCacheService in place)
Phase 7 (US5 Crisis)      → Depends on Phase 4 (CoachingProcessor integration point)
Phase 8 (US6 Data Rights) → Depends on Phase 2 (entities in place)
Phase 9 (Polish)          → Depends on all phases complete
```

### User Story Dependencies

- **US1 (P1 Onboarding)**: Can start after Phase 2. No dependency on other stories. ← MVP entry gate
- **US2 (P2 Coaching)**: Depends on US1 completing `MessagingModule` scaffold (T030–T033). Otherwise independent.
- **US3 (P3 MMS Nutrition)**: Depends on US2 `CoachingProcessor` routing being in place (T055).
- **US4 (P4 Context)**: Depends on US2 `SessionCacheService` (T053) and `CoachingProcessor` (T055).
- **US5 (P5 Crisis)**: Depends on US2 `CoachingProcessor` integration point (T082). `SafetyService` is otherwise independent.
- **US6 (P6 Data Rights)**: Depends only on Phase 2 entities. Can be worked in parallel with US3–US5.

### Within Each User Story

```
Contract tests [P]  → can run in parallel before implementation
Entity/DTO tasks [P] → run in parallel
Services          → after entities
Controllers       → after services
Processor/Queue   → after services
Integration tests → after full story implementation
```

### Parallel Execution Examples

```bash
# Phase 2 — run all entity creation tasks in parallel:
T012 User entity
T013 Subscription entity
T014 ConversationSession entity
T015 Message entity
T016 NutritionalAnalysis entity
T017 CrisisAlert entity
T018 SessionSummary entity
T019 ProcessedStripeEvent entity

# Phase 3 (US1) — run all form step components in parallel:
T036 Step1Goals
T037 Step2BodyMetrics
T038 Step3HealthInfo
(then T039 Step4Contact, T040 Step5Payment in sequence after)

# Phase 4 (US2) — run guard + DTO creation in parallel:
T046 TwilioWebhookDto
T047 SendBlueWebhookDto
T048 TwilioWebhookGuard
T049 SendBlueWebhookGuard
```

---

## Implementation Strategy

### MVP First (US1 + US2 = Minimal Shippable Product)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (entities + migrations)
3. Complete Phase 3 (US1): Onboarding + Stripe + Welcome SMS
4. **STOP and VALIDATE**: Form → Stripe → welcome SMS < 30s ✅
5. Complete Phase 4 (US2): SMS AI Coaching Loop
6. **STOP and VALIDATE**: Text in → coaching reply < 10s ✅
7. **DEPLOY to staging** — this is a shippable MVP

### Full Phase 1 Delivery (All 6 User Stories)

1. Setup + Foundational → Foundation
2. US1 Onboarding → Enrolment gate
3. US2 Coaching → Core value loop
4. US3 MMS Nutrition → Engagement driver
5. US4 Context → Retention driver
6. US5 Crisis Detection → Safety gate (non-negotiable)
7. US6 Data Rights → Compliance layer
8. Polish → Launch readiness

### Parallel Team Strategy (2 developers)

```
Developer A: US1 → US3 → US5
Developer B: US2 → US4 → US6
Both join: Phase 9 Polish
```

---

## Task Summary

| Phase | Tasks | Parallelizable |
|-------|-------|----------------|
| Phase 1: Setup | T001–T008 (8 tasks) | T003–T008 (6) |
| Phase 2: Foundational | T009–T023 (15 tasks) | T012–T019 (8) |
| Phase 3: US1 Onboarding | T024–T045 (22 tasks) | T024, T025, T036–T039, T044–T045 (8) |
| Phase 4: US2 Coaching | T046–T059 (14 tasks) | T046–T050, T058–T059 (7) |
| Phase 5: US3 MMS | T060–T067 (8 tasks) | T060, T066–T067 (3) |
| Phase 6: US4 Context | T068–T075 (8 tasks) | none (sequential) |
| Phase 7: US5 Crisis | T076–T085 (10 tasks) | T076–T077, T085 (3) |
| Phase 8: US6 Data Rights | T086–T092 (7 tasks) | T086–T087, T091–T092 (4) |
| Phase 9: Polish | T093–T102 (10 tasks) | T093, T094, T096, T100 (4) |
| **Total** | **102 tasks** | **43 parallelizable** |

---

## Notes

- All file paths reference the web-app structure: `backend/src/`, `frontend/src/`
- `[P]` tasks touch different files — safe to execute simultaneously
- Story labels `[USn]` map to spec.md user story priorities (P1=US1, P2=US2, etc.)
- Commit after each completed task or logical group of parallel tasks
- Run `npm run test` after every task before moving to the next
- Stop at each phase checkpoint to validate independently before proceeding
- Constitution check required in every PR — all 10 gates must pass
