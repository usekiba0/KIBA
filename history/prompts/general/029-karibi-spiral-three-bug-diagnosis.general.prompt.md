---
id: 029
title: Karibi spiral three bug diagnosis
stage: general
date: 2026-07-21
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: fix/remove-text-debounce
user: usekiba0
command: none
labels: ["bug-report", "reminders", "faith-verse", "memory", "diagnosis"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - (diagnosis only — no code changed this turn)
tests:
 - none
---

## Prompt

KIBA keeps spiraling couple important and noticeable errors 🚨please go back and read my chat history so u can confirm and know what I'm talking about bc we already tried to fix some of these issues

1. I already told it the stuff it's asking like my PPL days and times and it's asking again

2. It sent the same exact Bible verse from yesterday. And it sent duplicate messages again it sent two of the same yesterday and today.

3. I asked it to remind to me to read the bible and demand proof multiple times and it confirmed it you read our chat you'll see but it didn't remember and didndt even bring it up.

(+ screenshot: 5 automated messages at 8:50am — proof-check reminder, morning check-in asking to pick PPL days, the same Matthew 6:34 verse twice back to back differing only by surrounding quote marks, then "yo. leg day starts now.")

## Response

Could NOT read the user's SMS history — no prod DB access from here. Diagnosis is from the screenshot plus a code trace. Four distinct root causes, three of them confirmed in code, one needing a DB query to confirm.

### 1. Re-asking the PPL split — no place to store it
`save_profile_field` (`src/ai/coaching.service.ts:274-299`) has a CLOSED enum of psychological fields only (fears, comparison_figure, embarrassment, …). There is no structured store for a recurring weekly training split anywhere: `Goal.action_plan.weekly_breakdown` is free-text generated once at plan time (`src/data/entities/goal.entity.ts:6-10`), and `DailyTodo` is per-day (`src/data/entities/daily-todo.entity.ts`). So a split named mid-conversation lands only in raw history (60-turn window, `coaching.processor.ts:239`) and in `relationship_memory`, a prose digest merged only at session close (`src/ai/summarisation.service.ts:96-113`). Once it ages out, KIBA re-asks. The morning check-in copy that re-asks is deterministic: `src/ai/prompts/checkin.prompt.ts:148`.

### 2. The verse is NOT coming from the faith system
Decisive: **Matthew 6:34 is not in `FAITH_POOL`** (`src/accountability/faith-content.ts:32-121`) — the pool has Matthew 6:**33**, and no entry carries a "(NIV)" suffix. `buildFaithBlock` also always prefixes `verse for today:` and is concatenated INTO the check-in string (`checkin.processor.ts:235-240`), so it can never arrive as its own bubble, and never twice.

So both verse bubbles were LLM-authored. `src/ai/prompts/coaching.prompt.ts` contains no verse rule at all — the ritual is promised at intake (`src/ai/prompts/intake.prompt.ts:142`) and then improvised. Most likely mechanism: the model satisfied "remind me to read the bible daily" by calling `schedule_reminder` with `recurrence: daily` and a verse baked into the message body — twice, on two different days. That single explanation covers all three symptoms at once: same verse every day (recurring text is frozen at creation), duplicate delivery (two chains), and no proof demand.

Risk this also creates: an unconstrained model authoring scripture can misquote it. On a faith feature that is worse than a duplicate.

### 3. Duplicate recurring chains survive dedup
`ScheduleService.enqueue` dedups on `(user_id, PENDING, DAILY, exact recurrence_local_time, exact message)` (`src/accountability/schedule.service.ts:173-197` + partial unique index `1781500000000-AddDailyReminderUniqueIndex.ts`). Two chains at 08:45 vs 08:50, or with one word different, both survive and both fire.

### 4. Last-resort send dedup is defeated by a quote mark
`src/messaging/messaging.service.ts:132-149` keys on `` `${to}::${clean}` `` — exact string, 90s, in-memory. `humanizeVoice` does not normalize quotes (`src/messaging/voice.ts:15-31`), so `"Therefore…"` and `Therefore…` are different keys. `to` is not phone-normalized in the key either (contrast `hasOptedOut`, which does normalize).

### 5. "Confirmed the reminder" with nothing persisted
Reminder creation is 100% tool-driven. If the model emits prose without a `tool_use` block, `runChat` exits the loop and the text ships with no write (`src/ai/coaching.service.ts:880-938`). Nothing reconciles "the reply promised a reminder" against "a row exists" — the output guards (`correctTimeClaims`, `correctEventTimingClaims`, `correctWeekdayClaims`) are date-math only. The only defence is a prompt line (`coaching.prompt.ts:609-610`) aimed at Haiku. `src/messaging/reminder-parser.ts` exists but is referenced only from tests — dead in production. There is also no `proof_required` flag on reminders anywhere; "demand proof" exists only as words inside the reminder body.

### Follow-ups / risks
- Needs a DB query on `scheduled_reminders` for this user to confirm the duplicate verse-bearing DAILY chains. `scripts/cleanup-orphan-jobs-and-dup-reminders.js` already reports this and is dry-run by default.
- Fix order and scope not yet agreed with the user — presented for a joint call rather than built unilaterally the weekend before beta.
