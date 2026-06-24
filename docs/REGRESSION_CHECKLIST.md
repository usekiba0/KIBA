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
| A17 | Text bursts debounce at 2s and coalesce into ONE AI input; image bursts stay at 1.5s | KIBA reacts to half a two-bubble send ("Bett" before "Karibi" lands) (V4 Rule 2) | `messaging/message-debouncer.service.ts` `debounceDelayFor` | `tests/unit/message-debouncer.service.spec.ts` |

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

---

## Open / not-yet-locked (tracked, fix + add a row when done)

- **Coaching.processor test harness** — RC‑5 self-heal, Layer 1 cross-session fetch, RC‑2 ask-city short-circuit, and the intake loop wiring are Tier B only; the processor has no unit harness. *Follow-up: build one and promote the B-rows to Tier A.*

**Resolved by the memory rework (2026-06-24):** RC‑3 (session reset wiping memory) — coaching history is now user-scoped (Layer 1) and the relationship digest loads every message (Layer 2), so a 4h reset or 30-message cap no longer causes amnesia. The message cap still exists but is now harmless.

**RC‑2 (2026-06-24):** NULL timezone no longer fabricates a time. We did NOT infer from area code (mobile number portability makes it an unreliable guess); instead the model is forbidden from stating a clock time when the zone is unknown and asks for the city once (we already capture city→offset deterministically).

**RC‑4 (2026-06-24):** loop guard broadened (`detectRepeatedChoiceLoop` catches a repeated either/or; `isAsk` counts imperatives) and now runs for intake too (LOOP ALERT), not just coaching.

_Last updated: 2026-06-24 — all transcript root causes (RC‑1/2/3/4/5) + Layers 1–3 (persistent memory). Every fix has a Tier‑A test or a Tier‑B smoke row._
