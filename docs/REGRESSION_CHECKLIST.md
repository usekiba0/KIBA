# KIBA Regression Checklist (deploy gate)

**Purpose:** every behavior we've fixed is recorded here as an *invariant* with the test
that proves it still holds. Before any deploy, run the gate. If it's green, no locked-in
fix has regressed. This is engineering-facing and lives in the repo so it shows up in PR diffs.

> Different from `feedback/KIBA_Behavior_Rulebook.md`, which is the *client-facing* spec of
> intended behavior. This file is the *enforcement* layer.

## The rule

**No fix is "done" until it has either:**
- a **Tier A** row below with a passing unit test (auto-enforced), **or**
- a **Tier B** row below with a manual smoke-check (run before a big deploy).

When you fix something, add its row here in the same PR.

## The gate

```
cd backend
npm test          # Tier A — must be green (731+ unit tests)
npx tsc --noEmit  # must be clean
```
Then, for any deploy touching prompts, routing, reminders, or onboarding, walk the **Tier B**
smoke checks against a test number.

---

## Tier A — deterministic invariants (auto-enforced by `npm test`)

| ID | Invariant (what must stay true) | Symptom if it regresses | Code | Test |
|----|----------------------------------|--------------------------|------|------|
| A1 | "what time is it" is answered in code from the user's offset, never estimated by the model | KIBA gives a wrong/"around" time | `messaging/local-time.ts`, `coaching.processor.ts` short-circuit | `tests/unit/local-time.spec.ts` |
| A2 | "what time is it in `<place>`" resolves the place's timezone deterministically (DST-aware) | wrong time for a named city | `messaging/world-time.ts` | `tests/unit/world-time.spec.ts` |
| A3 | Coaching `schedule_reminder` dispatch forwards `delay_minutes` / `local_clock` / `fire_at_iso` — it must NOT require `fire_at_iso` | "system's being weird"; reminders silently never set (RC‑1) | `ai/coaching.service.ts` `dispatchCoachingTool` | `tests/unit/coaching.service.spec.ts` › `dispatchCoachingTool — schedule_reminder` |
| A4 | A clock-time reminder needs a known offset; resolver errors clearly when it's null | reminder set at wrong time / silent failure | `messaging/reminder-time.ts` | `tests/unit/reminder-time.spec.ts` |
| A5 | Reminder phrasing parses correctly ("at 8:30am" → 08:30, "in 5 hours" → 300) | wrong reminder time | `coaching-reminder-parser` | `tests/unit/coaching-reminder-parser.spec.ts` |
| A6 | Verbal "I already paid" is never trusted — only a Stripe sub activates a user | user lies into free coaching | intake payment-claim backstop | `tests/unit/payment-claim.spec.ts` |
| A7 | Question-loop detection fires on repeated same-topic asks / user loop call-outs | KIBA re-asks the same question | `messaging/question-loop.ts` | `tests/unit/question-loop.spec.ts` |
| A8 | No markdown / em-dashes in outbound; multi-bubble split is preserved | junk rendering on phone | `humanizeVoice`, `splitBubbles` | `tests/unit/bubbles.spec.ts`, voice specs |
| A9 | Relationship-memory merge NEVER blanks stored memory on an empty/failed result | KIBA forgets everything after one bad merge (RC‑3 / Layer 2) | `ai/summarisation.service.ts` `updateRelationshipMemory` | `tests/unit/relationship-memory.spec.ts` |
| A10 | The persistent relationship digest is injected into the coaching prompt when present | KIBA ignores what it "remembers" | `ai/prompts/coaching.prompt.ts` memory section | `tests/unit/coaching.prompt.spec.ts` › "injects the persistent relationship memory" |
| A11 | Durable "never forget" facts are append-only (new appended, dupes ignored) and injected every message | a hard fact (death, allergy, partner's name) drifts out of the digest (Layer 3) | `ai/summarisation.service.ts` `extractAndStoreHardFacts`; `coaching.prompt.ts` known-facts | `tests/unit/relationship-memory.spec.ts`, `tests/unit/coaching.prompt.spec.ts` › "never forget hard facts" |
| A12 | Intake prompt FORBIDS guessing a clock time when timezone is unknown; tells it to ask city | model fabricates "it's 3:13pm" (RC‑2) | `ai/prompts/intake.prompt.ts` timeBlock | `tests/unit/intake-prompt.spec.ts` › "forbids guessing a clock time" |
| A13 | Repeated-choice loop fires when the SAME either/or ("today or tomorrow") is posed across turns; `isAsk` counts imperatives ("pick one") | KIBA circles a binary choice (RC‑4) | `messaging/question-loop.ts` `detectRepeatedChoiceLoop`, `isAsk` | `tests/unit/question-loop.spec.ts` › "detectRepeatedChoiceLoop" |
| A14 | Intake injects a LOOP ALERT when the guard flags circling (loop guard now runs for intake, not just coaching) | KIBA circles during the SMS sales build (RC‑4) | `ai/prompts/intake.prompt.ts` loopBlock; `coaching.processor.ts` intake ctx | `tests/unit/intake-prompt.spec.ts` › "injects a LOOP ALERT into intake" |
| A15 | Intake is diagnostic not scripted: bans "what makes you fold" / cold "why does it matter", asks business TYPE before bottleneck, collects emotional driver by goal type, takes initiative on check-in (V4 Dev Notes Piece 1) | scripted lines that ignore what the user said (V4 BUG #1/#3) | `ai/prompts/intake.prompt.ts` BUILD flow | `tests/unit/intake-prompt.spec.ts` › "bans the two scripted lines", "diagnosing the business TYPE", "emotional driver by goal type" |
| A16 | Post-pay coaching is enforcer AND achievement partner: DIAGNOSE & BUILD by goal type (business TYPE before bottleneck), no-generic/copy-paste rule, take-initiative; prompt stays under the 26k size budget | KIBA just tracks instead of helping; generic/scripted coaching replies; prompt bloat | `ai/prompts/coaching.prompt.ts` | `tests/unit/coaching.prompt.spec.ts` › "enforcer AND achievement partner", "diagnose by goal type", "no-generic / copy-paste", "size budget" |
| A17 | Bursts coalesce into ONE AI input: text at 2s, images at 3s (multiple photos sent up to 3s apart batch into one reply) | KIBA reacts to half a two-bubble send, OR replies to EACH of several images separately (botty/spammy) | `messaging/message-debouncer.service.ts` `debounceDelayFor` | `tests/unit/message-debouncer.service.spec.ts` › "batches multiple images" |
| A18 | When the model ends a turn on a tool call with NO text, the forced completion appends a "reply now" nudge and retries — never returns empty | the canned "still with you on…" fallback pastes over the real reply (Ali/Sam transcript) | `ai/coaching.service.ts` runChat forced completion | `tests/unit/coaching.service.spec.ts` › "retries the forced completion with a reply nudge" |
| A19 | Check-in / to-do rendering strips ANY "Day N…:" plan label (incl. "Day 1 (Monday):"), uses plain dashes not bullets, and has no em-dashes | malformed daily plan ("• Day 1 (Monday): …—…" on a Thursday) (msg #35) | `ai/prompts/checkin.prompt.ts` `stripDayPrefix`/`humanizeTask`; `accountability/todo.service.ts`; `ai/prompts/plan.prompt.ts` | `tests/unit/checkin.prompt.spec.ts`, `tests/unit/todo-plan-split.spec.ts` |
| A20 | EVERY outbound message is sanitized at the `send()` chokepoint (markdown + em/en-dash + unicode bullets) — not just LLM coaching replies | deterministic generators (recap, weekly review, ghost, surprise, milestone, dunning) ship raw em-dashes/markdown to the phone | `messaging/messaging.service.ts` `send()` → `humanizeVoice`; `messaging/voice.ts` | `tests/unit/messaging-media.spec.ts` › "sanitizes the body at the send chokepoint", `tests/unit/voice.spec.ts` |
| A21 | A multi-photo send produces ONE image block per image (capped at 4) in a single AI message — KIBA reacts to the whole set | KIBA only reacts to the first of several photos | `ai/coaching.service.ts` runChat (`imageUrls[]`); `coaching.processor.ts` passes `mediaUrls.slice(0,4)` | `tests/unit/coaching.service.spec.ts` › "runChat multi-image" |
| A22 | Intake checkout link only sends on an explicit link request OR a real commitment to the close (`isIntakeCommitment` + last KIBA msg was the challenge) — NEVER on a stall counter | a Stripe checkout link fires mid-diagnostic out of nowhere (at "5k a month LMAO") | `coaching.processor.ts` link-delivery (removed stall-force); `isIntakeCommitment` | `tests/unit/intake-commitment.spec.ts` |
| A23 | Intake reply scrub: decorative emoji (😎 after a greeting, 🔥 after a name, any emoji) and the "love it / great / perfect / awesome …" filler opener are stripped from EVERY intake reply, deterministically — prompt rules alone never killed them | emoji-spam opener, "love it" in every review (flagged repeatedly) | `messaging/voice.ts` `scrubIntakeVoice`; applied in `coaching.processor.ts` `handleIntakeMessage` | `tests/unit/voice.spec.ts` › `scrubIntakeVoice` |
| A24 | Intake close = "N day lock in" CHALLENGE, framing ALWAYS before the link: the URL is preceded by `CLOSE_LEAD_IN` ("bet. tap this and we start tonight:") and the model's trailing reply is suppressed so nothing lands AFTER the link. NO "free trial" / "cancel anytime" / price quoted at the link — price waits for day 7 | link drops first then "7 days free" framing comes after (backwards); SaaS "free trial" vibe; "$20/month" at the close | `coaching.processor.ts` `CLOSE_LEAD_IN` + leadIn on every intake `sendPaymentLink` + suppress-on-`linkJustSent`; `ai/prompts/intake.prompt.ts` steps 7-8 | `tests/unit/intake-prompt.spec.ts` › "puts the framing BEFORE the link", "frames the trial as the configured N day lock in" |
| A25 | Day-7 price reveal: ONE KIBA-voice message fires ~4h before the trial charges, framing the price as the next step after a week of value (never "free trial"); idempotent + skips churned/unactivated/crisis users; scheduled at activation off the real Stripe `trial_end`; the day-4 `trial_will_end` message no longer quotes price or says "no action needed" (would pre-empt the reveal) | price arrives as a surprise bill or a robotic SaaS "trial ends" notice; double-fires; reveals to a churned user | `accountability/checkin.processor.ts` `handleTrialPriceReveal`/`buildTrialPriceReveal`; `onboarding/stripe-webhook.controller.ts` schedules `trial-price-reveal`; `user.trial_price_revealed_at` (migration 1781200000000) | `tests/unit/checkin.processor.spec.ts` › "handleTrialPriceReveal", `tests/unit/stripe-reactivation.spec.ts` › "schedules the day-7 price reveal" |
| A26 | A new subscriber gets EXACTLY ONE activation message. `customer.subscription.created` does NOT send an activation SMS — each onboarding path sends its own (SMS: `checkout.session.completed` "you're in"; web-form: `OnboardingService.submit` welcome). The event keeps only its `scheduleCheckin` safety net | two activation texts back to back ("you're in" + "your coaching is active 💪") | `onboarding/stripe-webhook.controller.ts` `customer.subscription.created` (SMS send removed) | `tests/unit/stripe-reactivation.spec.ts` › "does NOT send a duplicate activation SMS" |
| A27 | Intake carries the SALES PSYCHOLOGY layer (Sales Psychology Guide + V2): the 7 named levers — sell-the-mechanism, remove-shame, pain-amplification mirror, commitment-stacking, loss-aversion+identity, real-urgency-from-their-timeline (NEVER fake), specific social proof — applied NATURALLY not scripted; PLUS personality-match (joker/driven/skeptic/hesitant/competitive/price-sensitive); and the whole sign-up flow is emoji-free | feature-selling ("7 days free, tap it") that doesn't convert; same tone for everyone | `ai/prompts/intake.prompt.ts` `salesBlock`/`personalityBlock` + steps 5/7 + PAYWALL loss-aversion | `tests/unit/intake-prompt.spec.ts` › "teaches the core sales-psychology principles", "reads personality and matches the sales tone" |
| A28 | NO celebration when they tap the link — the activation SMS just moves into the plan ("alright. we're locked in on X. what's the first move today?"), never "you're in / coaching mode unlocked / let's go". Lifecycle SMS (cancellation, payment-failed, trial-ended) are KIBA-voice, not robotic SaaS copy | automated-sounding "coaching mode unlocked 🎉" celebration on tap | `onboarding/stripe-webhook.controller.ts` activation + lifecycle messages | covered by build + `tests/unit/stripe-reactivation.spec.ts` (no-duplicate) |
| A29 | Post-pay retention uses LOSS AVERSION: "i quit"/"i'm cancelling" → frame leaving as losing the execution score/streak they BUILT ("you're at [score], dropping it is the real cost"), never a desperate "please stay" | KIBA lets a paying user quietly churn or begs | `ai/prompts/coaching.prompt.ts` quit/cancel rule | `tests/unit/coaching.prompt.spec.ts` size budget (26.5k) + build |

## Tier B — behavioral smoke checks (run by hand before a big deploy)

| ID | Scenario to run against a test number | Pass = |
|----|----------------------------------------|--------|
| B1 | Pay, then text KIBA *immediately* (before the webhook lands) | KIBA coaches you — does NOT re-pitch the link (RC‑5 self-heal) |
| B2 | As a paid user with NO city given, ask "remind me at 8:30am to X" | KIBA either sets it for 8:30 or asks your city once — never "system's being weird" (RC‑1 + RC‑2) |
| B3 | Fast back-and-forth of 12+ turns negotiating one thing | KIBA does not forget the topic or re-ask "today or tomorrow" (RC‑3 / Layer 1 cross-session history) |
| B4 | Ask the time inside a larger sentence ("is it too late? what time even is it") | time given matches reality (RC‑2) |
| B5 | Talk over 2 days (let a session expire), then reference yesterday | KIBA remembers yesterday's conversation and commitments (Layer 1 + Layer 2) |
| B6 | As a user with NO city given, ask "what time is it" | KIBA asks for your city — never states a guessed time (RC‑2 deterministic short-circuit) |
| B7 | New user gives a business goal | KIBA asks the business TYPE first, diagnoses, converges on one move, then asks the emotional driver — never fires "what makes you fold" (V4 Piece 1; also `scripts/sim-intake.ts`) |
| B8 | Send a photo that ISN'T the day's proof (a logo, a random pic, with a question) | KIBA reacts to what's actually in the photo + answers the question — never repeats a canned "that doesn't look like 'Day 2: …'" rejection (`coaching.processor.ts` routes confident proof-mismatch to the vision reply; "logged" line strips the day prefix) |
| B9 | Run a full intake to the close, say "yes" to the challenge | KIBA sends ONE framing line then the link (framing BEFORE link), never re-asks "you ready" after the yes, and never sends two back-to-back messages without waiting (A23/A24 + intake step 7-8 "ask ONCE, then STOP and WAIT") |
| B10 | Pay, let the 7-day trial run to ~day 7 (or shorten STRIPE_TRIAL_DAYS on a test number) | ~4h before the charge KIBA sends ONE KIBA-voice price reveal ("7 days straight… most people fall off by day 3 and you didn't… $20/month, less than two doordash orders"), framed as the next step — not a surprise bill, not a SaaS "trial ends" notice; fires once (A25) |
| B11 | Run intakes as different personalities — a joker (jokes/casual), a driven one (numbers/goals), a skeptic (pushback), a price-sensitive one (asks cost) | KIBA matches the tone (humor vs directness vs specifics vs cost-reframe), runs the pain-amplification mirror before the close, and never quotes price before day 7 (A27 + Sales Psychology docs) |

---

## Open / not-yet-locked (tracked, fix + add a row when done)

- **Coaching.processor test harness** — RC‑5 self-heal, Layer 1 cross-session fetch, RC‑2 ask-city short-circuit, and the intake loop wiring are Tier B only; the processor has no unit harness. *Follow-up: build one and promote the B-rows to Tier A.*

**Resolved by the memory rework (2026-06-24):** RC‑3 (session reset wiping memory) — coaching history is now user-scoped (Layer 1) and the relationship digest loads every message (Layer 2), so a 4h reset or 30-message cap no longer causes amnesia. The message cap still exists but is now harmless.

**RC‑2 (2026-06-24):** NULL timezone no longer fabricates a time. We did NOT infer from area code (mobile number portability makes it an unreliable guess); instead the model is forbidden from stating a clock time when the zone is unknown and asks for the city once (we already capture city→offset deterministically).

**RC‑4 (2026-06-24):** loop guard broadened (`detectRepeatedChoiceLoop` catches a repeated either/or; `isAsk` counts imperatives) and now runs for intake too (LOOP ALERT), not just coaching.

_Last updated: 2026-06-24 — all transcript root causes (RC‑1/2/3/4/5) + Layers 1–3 (persistent memory). Every fix has a Tier‑A test or a Tier‑B smoke row._
