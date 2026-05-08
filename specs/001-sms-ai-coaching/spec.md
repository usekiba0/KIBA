# Feature Specification: KIBA — Phase 1: SMS-First Psychological Accountability System

**Feature Branch**: `001-sms-ai-coaching`
**Created**: 2026-05-09
**Status**: Active
**Input**: KIBA is an SMS-first psychological accountability system that makes ignoring goals impossible. It combines deep psychological profiling, pressure-based AI messaging, proof submission, strike tracking, and an execution score to force execution through structured accountability loops.

---

## User Scenarios & Testing

### User Story 1 — Psychological Onboarding & Goal Setup (Priority: P1)

A new user visits the KIBA landing page and completes a structured onboarding form that captures their goal, timeline, and a deep psychological intake (fears, avoidance patterns, comparison figures, public failure embarrassment, typical failure moments, pressure vs encouragement preference) — followed by payment to activate a 30-day free trial. Upon successful submission they receive a personalised welcome SMS from KIBA that references their own stated fears and gets the accountability conversation started immediately.

**Why this priority**: The psychological intake is the foundation of everything. Without it KIBA sends generic messages. With it, KIBA can inject the user's own words back at them — making pressure feel personal and unavoidable. This is the monetisation gate and the data collection moment.

**Independent Test**: Complete the full onboarding form with all psychological intake fields and a valid test card. Confirm a welcome SMS arrives within 30 seconds that references the user's stated goal or a specific fear they named. Confirm a trial subscription record is created.

**Acceptance Scenarios**:

1. **Given** a new visitor, **When** they complete all required form fields including psychological intake and submit with a valid card, **Then** a 30-day free trial subscription is created and a personalised welcome SMS is delivered within 30 seconds referencing their stated goal or a specific fear.
2. **Given** a user submitting an invalid card, **When** they submit, **Then** the form shows an inline payment error and no SMS is sent.
3. **Given** a user who completes onboarding, **When** they reply to the welcome SMS, **Then** the AI's first coaching response references their psychological profile — not a generic greeting.
4. **Given** a user who abandons mid-form, **When** they return and complete it, **Then** no duplicate subscription is created.
5. **Given** a user who selects "pressure" as their preference, **When** they receive their welcome SMS, **Then** the tone is sharp and direct. **Given** a user who selects "encouragement", **Then** the tone is supportive but still accountability-focused.

---

### User Story 2 — AI-Generated Action Plan (Priority: P2)

After onboarding, KIBA generates a structured action plan for the user's goal: milestones, a weekly breakdown, and specific daily tasks. The plan is delivered over SMS and stored as the baseline for all future check-ins.

**Why this priority**: Without a structured plan there is nothing to be held accountable to. The plan converts an abstract goal into concrete daily actions KIBA can track and pressure the user on.

**Independent Test**: Complete onboarding. Confirm KIBA sends a structured plan breakdown within 60 seconds of the welcome message. Confirm milestones, at least one weekly target, and today's first task are included. Confirm the plan is stored and referenced in subsequent check-ins.

**Acceptance Scenarios**:

1. **Given** a newly onboarded user, **When** the welcome flow completes, **Then** KIBA sends a structured plan that includes at least one milestone, a weekly breakdown, and today's first specific task — within 60 seconds.
2. **Given** a plan has been generated, **When** the user asks KIBA "what's my plan?", **Then** KIBA summarises the current plan and today's task.
3. **Given** a plan has been generated, **When** the user's execution score drops consistently, **Then** KIBA reduces task difficulty automatically without user request.
4. **Given** a plan has been generated, **When** the user completes tasks consistently for 7+ days, **Then** KIBA escalates challenge level.

---

### User Story 3 — Daily Check-in & Proof Submission (Priority: P3)

Each day, KIBA proactively texts the user with their task for the day. The user must confirm completion with proof (a photo via MMS or explicit text confirmation). KIBA responds with pressure-based feedback referencing their psychological profile. Failure to respond triggers the anti-ghosting system.

**Why this priority**: This is the core daily accountability loop. Check-ins without proof are passive. Proof-based check-ins are the mechanism that separates KIBA from a habit tracker.

**Independent Test**: Trigger a check-in message manually. Submit a proof photo via MMS. Confirm KIBA acknowledges the proof and responds with contextual pressure feedback. Then skip a check-in and confirm the anti-ghost follow-up arrives within the configured window.

**Acceptance Scenarios**:

1. **Given** it is the user's scheduled check-in time, **When** KIBA sends the daily task prompt, **Then** the message references the specific task from their plan and demands proof — not just confirmation.
2. **Given** a user submits a proof photo via MMS, **When** KIBA processes it, **Then** KIBA acknowledges the proof, updates the execution score, and responds with feedback referencing their psychological profile within 15 seconds.
3. **Given** a user confirms completion in text without a photo on a low-stakes task, **When** KIBA receives it, **Then** KIBA accepts it and updates the execution score.
4. **Given** a user does not respond to a check-in within the configured window (default: 2 hours), **When** the window expires, **Then** KIBA triggers the anti-ghosting system.
5. **Given** a user submits a non-food or irrelevant photo, **When** KIBA cannot validate it as task proof, **Then** KIBA requests a relevant proof submission.

---

### User Story 4 — Strike System & Execution Score (Priority: P4)

Every missed task adds a strike to the user's record. Every completed task improves their Execution Score (0–100). KIBA references strikes and score in its messages — turning accountability into a visible, gamified pressure mechanism.

**Why this priority**: The execution score makes accountability concrete and visible. Referencing it in messages creates ego pressure — users who see their score dropping are more likely to execute than users who receive generic reminders.

**Independent Test**: Miss two check-ins. Confirm strikes are logged. Confirm KIBA's next message references the strike count and the user's specific stated fear. Confirm the execution score decreases. Complete three consecutive check-ins with proof. Confirm the score rises and KIBA acknowledges it.

**Acceptance Scenarios**:

1. **Given** a user misses a check-in, **When** the no-response window expires, **Then** a strike is logged and KIBA sends a message referencing the missed task, the strike count, and a specific psychological trigger from their intake.
2. **Given** a user completes a check-in with proof, **When** KIBA processes it, **Then** the execution score increases and KIBA acknowledges the progress.
3. **Given** a user has 3+ strikes, **When** they next message KIBA, **Then** KIBA references their strike history and escalates pressure using their stated comparison figure or public failure fear.
4. **Given** a user asks "what's my score?", **When** KIBA receives it, **Then** KIBA states the exact execution score and what it reflects.
5. **Given** a user's execution score drops below 30, **When** this threshold is crossed, **Then** KIBA reduces plan difficulty automatically and acknowledges the reset.

---

### User Story 5 — Anti-Ghosting System (Priority: P5)

When a user stops responding, KIBA does not go silent. It escalates follow-up messages, demands acknowledgement of the miss, and assigns a recovery task. Users cannot silently disappear — they must either engage or explicitly reset.

**Why this priority**: Silent failure is the enemy of the product. If users can ghost without consequence, KIBA is just a notification system. The anti-ghosting system is what makes KIBA structurally different from every passive accountability tool.

**Independent Test**: Ignore all KIBA messages for 48 hours. Confirm KIBA sends at least two escalating follow-up messages. Confirm each message references the user's psychological profile. Confirm the final message demands an acknowledgement or reset before normal flow resumes.

**Acceptance Scenarios**:

1. **Given** a user does not respond to a check-in within 2 hours, **When** the window expires, **Then** KIBA sends a first follow-up that references their stated fear and demands a response.
2. **Given** a user does not respond within 24 hours, **When** this threshold is crossed, **Then** KIBA sends an escalated message referencing their comparison figure and the current strike count.
3. **Given** a user has been unreachable for 48 hours, **When** this threshold is crossed, **Then** KIBA sends a final recovery prompt — the user must either acknowledge the miss and accept a recovery task, or explicitly reset.
4. **Given** a user accepts a recovery task, **When** they confirm acceptance, **Then** normal check-in flow resumes with the recovery task as the next scheduled action.
5. **Given** a user explicitly resets, **When** the reset is processed, **Then** strikes are cleared, the execution score is logged as reset, the plan restarts, and KIBA acknowledges the reset with a message referencing their original goal.

---

### User Story 6 — Crisis Detection & Safety Handoff (Priority: P6)

A user in genuine distress sends a message containing crisis signals. The system immediately pauses all pressure, sends a supportive holding message, and alerts a human coach within 5 minutes. Pressure tone is suspended until the crisis is explicitly resolved by a human.

**Why this priority**: KIBA uses pressure as a tool. Pressure applied to someone in genuine crisis is harmful. The safety system is non-negotiable and must always override the accountability engine.

**Independent Test**: Send messages with known crisis signals. Confirm a supportive holding message arrives within 3 seconds. Confirm AI pressure responses are suspended. Confirm a coach alert is dispatched within 5 minutes with user context.

**Acceptance Scenarios**:

1. **Given** a user sends a message with a high-confidence crisis keyword, **When** detected, **Then** within 3 seconds they receive a supportive holding message and all pressure responses are suspended.
2. **Given** a user sends repeated negative emotional messages below keyword threshold, **When** the ML model flags them above the confidence threshold, **Then** the holding message and coach alert are triggered.
3. **Given** a crisis is detected, **When** 5 minutes have passed, **Then** the coach has received an SMS or email alert with the user's name, phone number, triggering message, and current plan context.
4. **Given** a crisis-flagged user, **When** the human coach resolves the alert, **Then** KIBA resumes — starting with a gentle re-engagement message, not immediate pressure.
5. **Given** distress signals in a first-ever message from a new user, **Then** the safety flow activates identically to any established user.

---

### User Story 7 — Persistent Memory & Context-Aware Accountability (Priority: P7)

KIBA remembers everything: the user's psychological intake, their goal, their plan, their strike history, their execution score, and their recent conversation. Returning users never re-introduce themselves — KIBA picks up exactly where it left off and uses the accumulated history to intensify personalisation over time.

**Why this priority**: Accountability compounds. A system that forgets loses all leverage. A system that remembers a user's specific fears from week one and references them in week six creates increasing pressure that a fresh session could never replicate.

**Acceptance Scenarios**:

1. **Given** a user returns after a session boundary, **When** they send their first message, **Then** KIBA references their current execution score, recent strike history, or a specific element of their psychological intake — without being prompted.
2. **Given** a user explicitly requests a context reset, **When** processed, **Then** KIBA clears conversational history but retains the psychological intake profile and goal — and confirms this to the user.
3. **Given** a user has built 14+ days of history, **When** they message KIBA, **Then** KIBA's responses demonstrate longitudinal awareness — referencing progress patterns, not just the latest message.

---

### Edge Cases

- What happens when a user submits a number that cannot receive SMS?
- How does the system handle multiple rapid messages before KIBA has responded?
- What if the AI provider is temporarily unavailable when a check-in is due?
- What if a proof photo is sent but contains no recognisable task evidence?
- What if the welcome SMS fails to deliver after successful payment?
- What if a user registers with a phone number already in the system?
- What if crisis detection fires a false positive on a clearly non-distress message?
- What happens when a crisis is detected but the assigned coach is unreachable?
- What if a user's trial expires mid-check-in flow?
- What if a user attempts to reset more than once in a short window (reset abuse)?

---

## Requirements

### Functional Requirements

**Onboarding & Payment**

- **FR-001**: System MUST present a multi-step onboarding form collecting: goal description, goal timeline, current status, psychological intake (fears, avoidance, comparison figure, public embarrassment scenario, typical failure moment, pressure vs encouragement preference), name, phone number, and payment card.
- **FR-002**: System MUST activate a 30-day free trial on valid payment submission — no charge at sign-up.
- **FR-003**: System MUST NOT send the welcome SMS until the full form including payment is successfully submitted.
- **FR-004**: System MUST deliver a personalised welcome SMS within 30 seconds of successful submission, referencing the user's goal or a specific fear they stated.
- **FR-005**: System MUST generate and send an action plan (milestones, weekly breakdown, first daily task) within 60 seconds of the welcome message.
- **FR-006**: System MUST validate the submitted phone number is SMS-capable before completing registration.

**Daily Check-in & Proof System**

- **FR-007**: System MUST send a daily check-in message to each active user at their configured time, stating their specific task for the day and demanding proof of completion.
- **FR-008**: System MUST accept MMS photo submissions as proof of task completion and process them within 15 seconds.
- **FR-009**: System MUST accept explicit text confirmation as proof for low-stakes tasks.
- **FR-010**: System MUST respond to every proof submission with contextual pressure feedback referencing the user's psychological profile within 15 seconds.
- **FR-011**: System MUST trigger the anti-ghosting flow when a user does not respond to a check-in within 2 hours (configurable).

**Strike System & Execution Score**

- **FR-012**: System MUST log a strike for every missed check-in and persist strike count per user.
- **FR-013**: System MUST maintain an Execution Score (0–100) per user, calculated from task completion rate, proof submission rate, response time to check-ins, and consistency streaks.
- **FR-014**: System MUST reference the user's strike count and execution score in accountability messages — not just state them on demand.
- **FR-015**: System MUST automatically reduce plan difficulty when execution score falls below 30 for 3+ consecutive days.
- **FR-016**: System MUST automatically increase plan challenge when execution score exceeds 80 for 7+ consecutive days.

**Anti-Ghosting System**

- **FR-017**: System MUST send a first follow-up message within 2 hours of a missed check-in, referencing the user's stated fear.
- **FR-018**: System MUST send an escalated follow-up at 24 hours of no response, referencing the comparison figure and strike count.
- **FR-019**: System MUST send a final recovery prompt at 48 hours requiring acknowledgement or explicit reset before normal flow resumes.
- **FR-020**: System MUST assign a recovery task when the user acknowledges a miss and resume normal flow upon recovery task acceptance.
- **FR-021**: System MUST process explicit resets: clear strikes, log the score reset event, restart the plan from step one, and retain the psychological intake profile.

**AI Coaching Behavior**

- **FR-022**: System MUST respond to every inbound user message within 10 seconds under normal operating conditions.
- **FR-023**: Every AI response MUST be 1–4 sentences, SMS-appropriate, direct, and end with a specific required action or confirmation.
- **FR-024**: Every AI response MUST reference the user's own words, psychological profile, or history — generic responses are prohibited.
- **FR-025**: AI MUST ask at most one question per response.
- **FR-026**: AI tone MUST adapt to the user's stated preference (pressure vs encouragement) while maintaining accountability intensity.
- **FR-027**: AI MUST NOT use motivational filler, bullet points, or clinical language in conversational turns.

**Safety & Crisis Detection**

- **FR-028**: System MUST use ML-based crisis detection covering explicit keywords and patterns of repeated negative sentiment.
- **FR-029**: System MUST send a supportive holding message within 3 seconds of crisis detection and suspend all pressure responses.
- **FR-030**: System MUST notify the assigned coach within 5 minutes of crisis detection via SMS and email with user context.
- **FR-031**: Pressure responses MUST NOT resume until the crisis alert is explicitly resolved by a human coach.

**Data & Privacy**

- **FR-032**: System MUST persist all messages, proof submissions, strikes, score history, and psychological intake data durably.
- **FR-033**: Payment card data MUST never be stored directly — only a Stripe payment token is retained.
- **FR-034**: Users MUST be able to request full data export or permanent deletion at any time.
- **FR-035**: Psychological intake data MUST be encrypted at rest and in transit and MUST never be sold or shared.

**iMessage Support**

- **FR-036**: System MUST deliver messages as iMessages to iPhone users when available via SendBlue, with automatic SMS fallback.
- **FR-037**: iMessage and SMS conversations MUST share the same session context and strike/score history.

---

### Key Entities

- **User**: Phone number (primary identifier), name, psychological intake profile, goal, goal timeline, registration timestamp, subscription status, pressure preference.
- **Subscription**: User reference, plan tier, trial start/end dates, Stripe payment token, billing status.
- **Goal**: User reference, goal description, timeline, current status, generated action plan (milestones, weekly tasks), plan difficulty level.
- **DailyTask**: Goal reference, task description, scheduled date, status (pending / completed / missed), proof reference, completion timestamp.
- **Proof**: Task reference, proof type (photo / text), media URL (for MMS), timestamp, validation status.
- **Strike**: User reference, missed task reference, strike timestamp, escalation level reached.
- **ExecutionScore**: User reference, current score (0–100), score history (daily snapshots), last updated timestamp.
- **ConversationSession**: User reference, start/end timestamps, session state (active / paused / crisis-hold), message history references, session summary.
- **Message**: Sender type (user / AI), content body, message type (text / MMS), media reference, timestamp, session reference.
- **CrisisAlert**: User reference, triggering message reference, detection method (keyword / ML), confidence score, detection timestamp, alert status, resolution status, resolving coach identifier.

---

## Success Criteria

- **SC-001**: 100% of completed onboarding submissions trigger a welcome SMS within 30 seconds.
- **SC-002**: 100% of welcomed users receive a structured action plan within 60 seconds of the welcome.
- **SC-003**: Users complete onboarding (landing page to first AI response) in under 5 minutes.
- **SC-004**: AI coaching replies delivered within 10 seconds for 95% of inbound messages under normal load.
- **SC-005**: Proof photo analyses returned within 15 seconds for 90% of valid submissions.
- **SC-006**: Anti-ghosting first follow-up sent within 2 hours of every missed check-in — 100% of cases.
- **SC-007**: 100% of detected crisis signals dispatch a coach alert within 5 minutes — zero missed alerts.
- **SC-008**: 100% of crisis-detected users receive a holding message within 3 seconds.
- **SC-009**: Returning users never need to re-state their goal or profile — context continuity verified across session boundaries.
- **SC-010**: Execution score updates within 60 seconds of every check-in completion or miss.

---

## Assumptions

- Phone numbers are the canonical user identifier. No email or social account linking in Phase 1.
- Payment card data is never stored — Stripe token only.
- Default check-in time is set during onboarding; configurable per user.
- Default anti-ghost first follow-up window is 2 hours; configurable.
- A single human coach is assigned per deployment for Phase 1.
- ML crisis model is a pre-trained classifier. Model selection is a planning-phase decision.
- Psychological intake data is used exclusively for personalised pressure — never for advertising, third-party sharing, or AI model training.
- Plan difficulty adjustment is automatic — users cannot manually reduce their own difficulty.
- Reset functionality clears strikes and conversational history but always retains the psychological intake profile and original goal.

---

## Out of Scope (Phase 1)

- Money Mode (financial stakes / commitment contracts)
- 1v1 Challenge Mode (social competition between users)
- Social Proof Cards (shareable wins)
- Gamification badges and levels
- Voice-based interaction
- Wearable device integrations
- Native mobile app (iOS or Android)
- Coach dashboard with visual analytics
- Multi-coach routing
- WhatsApp or email coaching channel
- Re-engagement campaigns for cancelled users
