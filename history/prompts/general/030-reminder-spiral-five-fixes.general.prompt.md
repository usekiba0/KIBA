---
id: 030
title: Reminder spiral five fixes
stage: general
date: 2026-07-21
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: fix/reminder-spiral
user: usekiba0
command: none
labels: ["reminders", "faith-verse", "memory", "dedup", "migration"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/accountability/reminder-content.ts (new)
 - backend/src/ai/reminder-claim-guard.ts (new)
 - backend/src/messaging/send-dedup.ts (new)
 - backend/src/data/migrations/1781800000000-AddWeeklySchedule.ts (new)
 - backend/src/accountability/schedule.service.ts
 - backend/src/accountability/checkin.processor.ts
 - backend/src/ai/coaching.service.ts
 - backend/src/ai/prompts/coaching.prompt.ts
 - backend/src/messaging/messaging.service.ts
 - backend/src/messaging/coaching.processor.ts
 - backend/src/data/entities/user.entity.ts
tests:
 - backend/tests/unit/reminder-content.spec.ts (new)
 - backend/tests/unit/reminder-claim-guard.spec.ts (new)
 - backend/tests/unit/send-dedup.spec.ts (new)
 - full unit suite: 1075 pass / 79 suites
---

## Prompt

do all 5

(Following the diagnosis in PHR 029 — the user approved the full fix list including the migration.)

## Response

Confirmed the diagnosis against production first via the admin API (`/v1/admin/users/:id/reminders` and `/messages`), which changed the picture materially: the verse was NOT a hash collision in the curated pool. Three separate model-authored DAILY chains were live at 09:00 —

```
09:00 daily  "yo. leg day starts now…"                    → said "leg day" 7 days a week
09:00 daily   Therefore do not worry… Matthew 6:34 (NIV)  → unquoted
09:00 daily  "Therefore do not worry… Matthew 6:34 (NIV)" → quoted
```

Matthew 6:34 is not in `FAITH_POOL` (which has 6:33 and never appends a translation), so no deterministic path could have produced it. The transcript also showed KIBA denying its own reminder ("you never asked me to send you Bible verses every morning") and then confirming an 8am Bible reminder that was never written.

### The five fixes

1. **`reminder-content.ts` — recurring-message content gate.** Rejects scripture citations, split-day names ("leg day"), and weekday names in DAILY reminders, since that text is frozen and replayed forever. Deterministic, not a prompt rule: the prompt already carried the instruction and the model broke it. Errors are written for the model to act on, so it gets a usable retry.
2. **`reminder-claim-guard.ts` — false-promise strip.** If a turn creates no reminder and reads none back, any "locked, 8am daily" claim is removed from the reply and replaced with a request for the time. Gated on `reminderWritesOk === 0 && reminderReads === 0` so a turn that really did schedule passes untouched — deleting a true statement would be its own lie. An ADVICE test ("you should set a reminder") prevents coaching being eaten.
3. **`send-dedup.ts` — normalized dedup key.** Lowercase, strip non-alphanumerics, collapse whitespace, normalize the phone. The old exact-match key was defeated by one quotation mark. Window 90s → 10 min, since two Bull jobs sharing a scheduled minute can land further apart than 90s.
4. **`reminderSignature` + supersede in `ScheduleService.enqueue`.** Re-committing a time used to stack pings (three "30 min till push" at one minute). One-shots matching a recognized structure (`pre:<activity>` / `proof:<activity>`) now cancel the stale equivalent within ±3h. Unrecognized reminders are never superseded — silent loss is worse than an extra ping.
5. **`users.weekly_schedule` + `save_weekly_schedule` tool + check-in suppression.** The split had nowhere to live, so the morning check-in re-asked for it 13h after the user answered. New nullable column, new tool, surfaced as a hard fact in the coaching prompt, and `isSchedulingTask()` suppresses a stale "pick your days and times" plan item once a schedule is on file.

### Acceptance
- [x] `tsc --noEmit` clean
- [x] 1075 unit tests pass across 79 suites (+60 new assertions)
- [x] Migration is additive, `IF NOT EXISTS`, nullable — NULL reproduces today's behaviour exactly
- [x] Prompt budget test raised 29.8k→30.3k, documented, after trimming the now-redundant false-promise argument (that rule is enforced in code now)

### Follow-ups / risks
- The three live chains on the reported account still exist — code fixes prevent new ones, they do not retroactively delete old ones. Needs a cleanup call.
- `SUPERSEDE_WINDOW_MS` (3h) is a judgement call; if a user genuinely trains the same split twice within 3h the earlier ping would be cancelled.
- The claim guard's rewrite is subtractive. A reply whose every sentence is a false claim becomes a bare ask for the time — correct, but blunter than KIBA's usual voice.
