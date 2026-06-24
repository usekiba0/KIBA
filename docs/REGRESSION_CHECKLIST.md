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

## Tier B — behavioral smoke checks (run by hand before a big deploy)

| ID | Scenario to run against a test number | Pass = |
|----|----------------------------------------|--------|
| B1 | Pay, then text KIBA *immediately* (before the webhook lands) | KIBA coaches you — does NOT re-pitch the link (RC‑5 self-heal) |
| B2 | As a paid user with NO city given, ask "remind me at 8:30am to X" | KIBA either sets it for 8:30 or asks your city once — never "system's being weird" (RC‑1 + RC‑2) |
| B3 | Fast back-and-forth of 12+ turns negotiating one thing | KIBA does not forget the topic or re-ask "today or tomorrow" (RC‑3) |
| B4 | Ask the time inside a larger sentence ("is it too late? what time even is it") | time given matches reality (RC‑2) |

---

## Open / not-yet-locked (tracked, fix + add a row when done)

- **RC‑2** — users reach coaching with `utc_offset_minutes = NULL` (webhook never sets it) → fabricated time + failed clock reminders. *Planned: infer offset from phone area code; ask city deterministically when unknown.*
- **RC‑3** — 30-message session cap wipes coaching history mid-conversation. *Planned: drop the message-count reset, keep 4h idle reset.*
- **RC‑4** — loop guard too narrow (misses imperative re-asks) and not wired into intake. *Planned: broaden detection + wire into intake.*
- **RC‑5 processor test** — self-heal is currently Tier B (B1) only; coaching.processor has no unit harness. *Follow-up: build a processor test harness and promote B1 to Tier A.*

_Last updated: 2026-06-24 — seeded with shipped invariants + RC‑1 (reminder dispatch) and RC‑5 (stage self-heal)._
