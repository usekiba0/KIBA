# Feature Specification: RYKE AI MVP — Phase 1: SMS-First AI Coaching

**Feature Branch**: `001-sms-ai-coaching`  
**Created**: 2026-04-29  
**Status**: Draft  
**Input**: User description: "RYKE AI MVP — Phase 1: SMS-first AI coaching platform covering comprehensive web onboarding form (goals, body metrics, health info, payment + free trial), AI coaching conversations (SMS + iMessage), MMS photo nutrition analysis, session context, ML-based crisis detection, safety handoff, and conversation history storage. iMessage support via SendBlue API."

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Comprehensive Web Onboarding & Free Trial Signup (Priority: P1)

A prospective user visits the RYKE AI landing page and completes a structured onboarding form that captures their coaching goals, body measurements, notable health information, and contact details — followed by card payment details to activate a 1-month free trial. Upon successful form submission, they receive a personalised welcome SMS that references their stated goals and gets the coaching conversation started immediately.

**Why this priority**: This is the entry and monetisation gate for the entire platform. Capturing structured data upfront eliminates early SMS discovery rounds, reduces message costs, and ensures the AI has rich context from the very first interaction. Payment capture establishes the commercial relationship from day one.

**Independent Test**: Can be fully tested by completing the full web form (all fields) with a valid test card, confirming a welcome SMS arrives within 30 seconds that references the user's stated goal, and verifying a trial subscription record is created. Delivers value: the user is enrolled, profiled, on a trial, and actively coaching.

**Acceptance Scenarios**:

1. **Given** a new visitor on the landing page, **When** they complete all required form fields (goals, body metrics, health notes, contact, card) and submit, **Then** a 1-month free trial subscription is created and a personalised welcome SMS is delivered within 30 seconds.
2. **Given** a user on the onboarding form, **When** they submit an invalid card number, **Then** the form shows an inline payment error and no SMS is sent until payment is valid.
3. **Given** a user who has completed the form and received the welcome SMS, **When** they reply to the SMS, **Then** the AI coach's response reflects their stated goals, body metrics context, and health notes without them needing to repeat the information.
4. **Given** a user with a notable health condition flagged in the form (e.g., diabetes), **When** the AI coach provides nutrition advice, **Then** the response takes the condition into account.
5. **Given** a user who abandons the form mid-way, **When** they return and complete it later, **Then** no duplicate subscription is created.

---

### User Story 2 — SMS AI Coaching Conversation (Priority: P2)

An enrolled user sends an SMS to the RYKE AI number at any time and receives a human-like, action-oriented coaching response tailored to their fitness, nutrition, or mental wellness goals — with exactly one question per reply, a concrete next step, and full awareness of their onboarding profile.

**Why this priority**: This is the core value delivery mechanism. Every other story enhances this flow, but this story alone constitutes the minimum viable coaching interaction.

**Independent Test**: Can be fully tested by texting the RYKE AI number from a registered phone and confirming the response is contextual to the user's profile, contains one action item, and arrives within 10 seconds. Delivers value: the user receives personalised coaching.

**Acceptance Scenarios**:

1. **Given** a registered user, **When** they send any SMS about fitness, nutrition, or wellness, **Then** the AI responds within 10 seconds with a message that is 1–4 sentences long, includes one actionable next step, and asks at most one follow-up question.
2. **Given** a user who stated a weight-loss goal and body weight in their onboarding form, **When** they ask for a meal plan, **Then** the AI's response is calibrated to their goal and body profile.
3. **Given** a user who sends a casual or off-topic message, **When** the AI responds, **Then** it gently redirects to coaching without ignoring the user's tone.
4. **Given** a registered user, **When** they text at 2 AM, **Then** the system responds with the same quality and speed as during business hours.

---

### User Story 3 — MMS Photo Nutrition Analysis (Priority: P3)

An enrolled user takes a photo of their meal and sends it as an MMS to the RYKE AI number. The AI analyses the image, estimates calories and macro-nutrients, and returns a coaching response with the nutritional breakdown and a concrete recommendation.

**Why this priority**: Photo-based nutrition analysis is a high-differentiation feature that significantly increases daily engagement. Users seeking nutrition coaching expect this as a core capability and it reduces friction compared to manual food logging.

**Independent Test**: Can be fully tested by sending an MMS with a food photo and verifying the AI returns a calorie estimate, macronutrient breakdown, and one dietary recommendation within 15 seconds. Delivers value: the user gets instant nutritional insight without manual entry.

**Acceptance Scenarios**:

1. **Given** a registered user, **When** they send an MMS containing a food photo, **Then** within 15 seconds they receive a reply with an estimated calorie count, a macro breakdown (protein / carbs / fat), and one specific nutritional recommendation.
2. **Given** a user with a health condition noted in onboarding (e.g., diabetes), **When** they submit a food photo, **Then** the nutritional response flags items relevant to their condition.
3. **Given** a user who sends an MMS with no food visible (e.g., a landscape photo), **When** the AI cannot identify food, **Then** it responds with a clear message explaining it couldn't identify a meal and asks the user to try again.
4. **Given** a user who sends multiple food photos in quick succession, **When** each is processed, **Then** each receives a distinct nutritional response without cross-contamination of context.

---

### User Story 4 — Context-Aware Coaching Across Sessions (Priority: P4)

A returning user who coached with RYKE AI in a previous session picks up the conversation and finds the AI remembers their onboarding profile, goals, and recent coaching history — without them needing to reintroduce themselves.

**Why this priority**: Context-awareness is what differentiates RYKE AI from a stateless chatbot. It enables compounding coaching value over time and reduces user drop-off from repetitive re-onboarding. The rich onboarding form data amplifies this.

**Independent Test**: Can be fully tested by starting a new conversation after a session boundary has elapsed, and confirming the AI's first reply references the user's stated goal or profile without prompting. Delivers value: the user experiences a persistent, personalised coaching relationship.

**Acceptance Scenarios**:

1. **Given** a user who completed the onboarding form, **When** they send their first SMS, **Then** the AI references their stated goal or relevant profile detail in the response.
2. **Given** a user whose last session ended (inactivity boundary elapsed), **When** they text again, **Then** the AI continues coaching from their last known context and acknowledges the gap warmly.
3. **Given** a user who explicitly asks to reset their coaching context, **When** they request it, **Then** the AI clears conversational history but retains their onboarding profile data (goals, health info, body metrics).

**Session Boundary**: A session ends after a period of inactivity (exact duration — e.g., 4 hours, 12 hours, or calendar-day reset — to be decided during planning). Active session state is held for fast retrieval; older session data is summarised and persisted for long-term context.

---

### User Story 5 — ML-Based Crisis Detection & Human Handoff (Priority: P5)

A user in distress sends a message containing crisis signals — whether explicit keywords, repeated negative sentiment, or ML-detected emotional patterns. The system immediately sends a supportive holding message, pauses AI coaching, and silently alerts a human coach within 5 minutes.

**Why this priority**: This is a non-negotiable safety requirement. ML-based detection catches signals that keyword lists alone miss. Failure has real-world consequences and the feature cannot be disabled or skipped.

**Independent Test**: Can be fully tested by sending messages with known crisis signals (explicit keywords and subtle distress language) and verifying: (a) a holding message arrives within 3 seconds, and (b) a coach alert is dispatched within 5 minutes. Delivers value: no distress signal goes unattended, even subtle ones.

**Acceptance Scenarios**:

1. **Given** a registered user, **When** they send a message containing a high-confidence crisis keyword, **Then** within 3 seconds they receive a supportive holding message and AI coaching is paused.
2. **Given** a user who sends three or more messages with repeated negative emotional patterns below keyword threshold, **When** the ML model flags them above the crisis confidence threshold, **Then** the holding message and coach alert are triggered.
3. **Given** a distress signal has been detected, **When** 5 minutes have passed, **Then** the assigned human coach has received an alert via SMS or email with the user's identifier and the triggering context.
4. **Given** a distress-flagged user, **When** a human coach resolves the alert, **Then** AI coaching can resume only after explicit coach action.
5. **Given** distress language in the very first message from a new user, **When** it is detected, **Then** the safety flow activates identically to any established user.

---

### User Story 6 — Conversation History Storage & Data Rights (Priority: P6)

All user messages, AI responses, MMS submissions, onboarding data, and nutritional analyses are durably stored — enabling session continuity, coach review, compliance, and user data rights (export and deletion).

**Why this priority**: Storage is the enabling foundation for context (P4), safety review (P5), and future analytics. It also satisfies data privacy obligations created by collecting health and payment information.

**Independent Test**: Can be fully tested by sending several messages and a food photo, then confirming all are persisted with correct metadata, and verifying a data deletion request removes all user records. Delivers value: conversation records, health data, and compliance artefacts are preserved and user-controlled.

**Acceptance Scenarios**:

1. **Given** a user sends a message and receives a reply, **When** the session ends, **Then** both messages are persisted with timestamp, user identifier, session identifier, and message type (text / MMS).
2. **Given** a user requests full data export, **When** the request is processed, **Then** all stored data (profile, messages, health info, subscription status, nutritional analyses) is returned in a readable format.
3. **Given** a user requests permanent data deletion, **When** the request is processed, **Then** all their data is permanently deleted within 30 days and their subscription is cancelled.

---

### Edge Cases

- What happens when a user submits a landline or VoIP number that cannot receive SMS?
- How does the system handle a user sending multiple rapid-fire messages before the AI has responded?
- What happens if the AI provider is temporarily unavailable when a user sends a message?
- How does the system respond if an MMS image is unreadable, corrupted, or contains no food?
- What happens if the welcome SMS fails to deliver after successful form submission and payment?
- How does the system handle a duplicate phone number registration (user already enrolled)?
- What happens if ML crisis detection flags a false positive on a clearly non-distress message?
- What happens when a distress signal is detected but no coach is available to receive the alert?
- How does the system behave if a user's free trial expires and they have not added a valid payment method?
- What happens if the payment processor declines a card but the user expects to be enrolled?
- How does the system handle an MMS from an unregistered number?

---

## Requirements *(mandatory)*

### Functional Requirements

**Onboarding & Payment**

- **FR-001**: System MUST present a multi-step onboarding web form that collects: coaching goals, target focus area (fitness / nutrition / wellness / combined), body measurements (height, weight, age), notable health information (conditions, injuries, dietary restrictions), contact details (name, phone number), and payment card details.
- **FR-002**: System MUST activate a 1-month free trial upon valid payment card submission — no charge is made at sign-up.
- **FR-003**: System MUST NOT send the welcome SMS until the onboarding form is fully and successfully submitted, including payment validation.
- **FR-004**: System MUST deliver a personalised welcome SMS within 30 seconds of successful form submission, referencing the user's stated goal.
- **FR-005**: The welcome SMS MUST invite the user to begin their coaching conversation immediately.
- **FR-006**: System MUST validate that the submitted phone number is capable of receiving SMS before completing registration.

**AI Coaching**

- **FR-007**: System MUST respond to every inbound user text message with a coaching reply within 10 seconds under normal operating conditions.
- **FR-008**: Every coaching response MUST be 1–4 sentences long and appropriate for a standard SMS thread.
- **FR-009**: Every coaching response MUST include exactly one actionable next step or follow-up question — never two or more in the same reply.
- **FR-010**: System MUST tailor coaching responses to cover fitness, nutrition, and mental wellness domains based on the user's onboarding profile and conversation history.
- **FR-011**: System MUST apply the user's onboarding data (goals, health info, body metrics) as persistent context for all coaching interactions.

**MMS Nutrition Analysis**

- **FR-012**: System MUST process inbound MMS messages containing food photos and return an estimated calorie count, macronutrient breakdown (protein / carbs / fat), and one dietary recommendation within 15 seconds.
- **FR-013**: Nutritional responses MUST account for any health conditions noted in the user's onboarding profile.
- **FR-014**: System MUST respond gracefully when an MMS image does not contain identifiable food — informing the user clearly and requesting a retry.

**Session Context & Data Persistence**

- **FR-015**: System MUST maintain an active session state for each user, held for fast retrieval during a conversation, and persisted to durable storage at session end.
- **FR-016**: A session boundary is triggered by a configurable period of user inactivity (default: 4 hours; exact value to be confirmed in planning). On the next message after a boundary, the AI loads summarised prior context from durable storage rather than raw message history.
- **FR-017**: System MUST persist all inbound and outbound messages (text and MMS) to durable storage with timestamp, user identifier, session identifier, and message type.
- **FR-018**: System MUST maintain full conversation context across session boundaries so returning users do not need to re-state their goals or profile.
- **FR-019**: Users MUST be able to reset their conversational history while retaining their onboarding profile data (goals, health info, body metrics).

**Safety & Crisis Detection**

- **FR-020**: System MUST use an ML-based model to identify crisis and distress signals in inbound messages, covering both explicit crisis keywords and patterns of repeated negative sentiment below keyword threshold.
- **FR-021**: Upon detecting a distress signal above the configured confidence threshold, system MUST immediately send a supportive holding message to the user and suspend AI coaching responses.
- **FR-022**: System MUST notify the assigned human coach via SMS or email within 5 minutes of a detected distress signal, including the user's identifier and triggering message context.
- **FR-023**: AI coaching MUST NOT resume for a distress-flagged user until the crisis alert has been explicitly resolved by a human coach.

**Data Rights & Privacy**

- **FR-024**: Users MUST be able to request full export or permanent deletion of all stored data including profile, messages, health information, nutritional analyses, and subscription records.
- **FR-025**: Payment card data MUST never be stored directly by RYKE AI — only a secure payment token from the payment processor is retained.
- **FR-026**: System MUST function on any SMS/MMS-capable device — smartphone or basic feature phone — without requiring an app or internet access on the user's device post-onboarding.

**iMessage Support (SendBlue)**

- **FR-027**: System MUST deliver coaching messages as iMessages to iPhone users when iMessage is available on the registered phone number, providing a native blue-bubble experience with no extra steps from the user.
- **FR-028**: System MUST fall back to standard SMS automatically when iMessage is unavailable (non-iPhone, iMessage disabled, or API error) — users experience no interruption to their coaching.
- **FR-029**: The iMessage API integration MUST route through the Messaging Layer only — no direct iMessage API calls from the AI or Data layers.
- **FR-030**: iMessage and SMS coaching conversations MUST share the same session context — a user switching between channels does not lose their coaching history.

---

### Key Entities

- **User**: Phone number (primary identifier), name, onboarding profile (goals, body measurements, health notes, coaching focus), registration timestamp, subscription status and trial expiry.
- **Subscription**: User reference, plan tier, trial start date, trial end date, payment token (not raw card data), billing status.
- **Conversation Session**: User reference, start timestamp, end timestamp, session state (active / paused / crisis-hold), message history references, session summary (generated at session close for context compression).
- **Message**: Sender type (user / AI), content body, message type (text / MMS), media reference (for MMS), timestamp, parent session reference.
- **Nutritional Analysis**: Message reference, detected food items, estimated calories, macronutrient breakdown (protein / carbs / fat), health-condition flags, dietary recommendation, confidence score.
- **Crisis Alert**: Triggering user reference, triggering message reference, detection method (keyword / ML), ML confidence score, detection timestamp, alert dispatch status, resolution status, resolving coach identifier.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of successfully completed onboarding form submissions trigger a welcome SMS within 30 seconds.
- **SC-002**: Users complete the full onboarding journey — landing page to first AI coaching reply — in under 5 minutes.
- **SC-003**: AI text coaching replies are delivered within 10 seconds for 95% of inbound messages under normal load.
- **SC-004**: MMS food photo analyses are returned within 15 seconds for 90% of valid food image submissions.
- **SC-005**: 100% of detected distress signals dispatch a coach alert within the 5-minute SLA — zero missed alerts.
- **SC-006**: 100% of distress-flagged users receive a holding message within 3 seconds of signal detection.
- **SC-007**: ML crisis detection achieves a false-negative rate below 5% on the predefined distress test set (validated before launch).
- **SC-008**: Returning users never need to re-state a goal from a previous session — context continuity verified across session boundaries.
- **SC-009**: The onboarding and coaching flows function correctly on a basic feature phone (non-smartphone), verified through end-to-end SMS/MMS testing.
- **SC-010**: All messages, MMS analyses, and onboarding data are durably persisted and retrievable within and across sessions.

---

## Assumptions

- Phone numbers are the canonical user identifier; no linking to email or social accounts is required in Phase 1.
- Payment card data is never stored directly — a secure payment token from the payment processor is stored instead. Payment processor selection (e.g., Stripe) is a planning-phase decision.
- The default session inactivity boundary is 4 hours. When a session expires, active state in the fast-access store is released and a session summary is written to durable storage. The exact timeout value is to be confirmed during planning and may be adjusted post-launch based on user behaviour.
- The ML crisis model is a pre-trained sentiment/intent classifier fine-tuned on mental health distress signals. Model selection, training data sourcing, and hosting approach are planning-phase decisions.
- A single human coach is assigned per deployment for Phase 1; multi-coach routing is Phase 2.
- Data deletion requests are processed within 30 days, consistent with standard data privacy practices.
- The AI coaching persona is consistent across fitness, nutrition, and wellness domains; domain-specific personas are Phase 2.
- Re-engagement messaging (proactively texting inactive users) is a Phase 2 feature and is out of scope for this spec.
- MMS analysis uses a vision-capable AI model; the specific model is a planning-phase decision.
- "Context reset" clears conversational history only — the user's onboarding profile (goals, health info, body metrics) is always retained unless the user explicitly requests full data deletion.

---

## Out of Scope (Phase 1)

- Native mobile app (iOS or Android)
- Coach dashboard or visual analytics UI
- Voice coaching or audio content
- Multi-channel support (WhatsApp, email, push notifications) — iMessage is in scope; other channels are not
- Wearable device integration
- Smart scheduling or reminder configuration UI
- Multi-coach routing or escalation pipeline UI
- Response delay configuration per user
- Advanced coach observability dashboard
- Re-engagement / win-back messaging for inactive users
