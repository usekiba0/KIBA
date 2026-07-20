---
id: 022
title: Karibi duplicate links + morning flood diagnosis
stage: explainer
date: 2026-07-08
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: master
user: usekiba0
command: (chat) check all msgs of karibi — duplicate sms, 2 payment links, dozens every morning
labels: ["diagnosis","messaging","scheduled-reminders","bull-queue","dunning","prod-data"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - (read-only) backend/src/accountability/schedule.service.ts
 - (read-only) backend/src/accountability/checkin.service.ts
 - (read-only) backend/src/accountability/anti-ghost.service.ts
 - (read-only) backend/src/accountability/checkin.processor.ts
 - (read-only) backend/src/data/data-rights.service.ts
 - (read-only) backend/src/messaging/messaging.service.ts
tests:
 - none (read-only prod diagnosis)
---

## Prompt

check all the msgs of all users specifically of karibi , why did he got duplicated sms and 2 payment links? also why am i geting dozen of msgs ever morning

## Response snapshot

Queried prod Postgres (Render Oregon external host) + live Bull/Redis (`accountability` queue) read-only. 3 live users: Sam, Karibi (+18325604035), Bianca.

**2 payment links / duplicate SMS (Karibi):** never paid (cs_test session, payment_pending). Link 1 = intake close ~07-07 15:53Z. Link 2 = dunning `payment-link-nudge` at 23:23:46Z (regenerates fresh Stripe link, re-sends, stamps payment_link_sent_at + dunning_nudges_sent 0→1). Working-as-designed (MAX_DUNNING_NUDGES=1) but reads as duplicate. Links bypass messages table (0 http rows); PR#12 dedup is in-memory + byte-identical-only so wouldn't collapse them.

**Dozens every morning:** system-level, not Karibi's own row (he gets no check-ins — payment_pending, check-ins gated to COMPLETE). From live queue (25 delayed jobs): (A) Bianca has TWO redundant daily 9am reminder chains (parents a1e01aab + b8f88c34, same weigh-in instruction) + her check-in = 3 back-to-back at 9am; reminder creation has NO dedup (unlike checkins' deterministic jobId). (B) Orphaned jobs for DELETED user 4a98db20 (send-checkin/surprise/weekly-review/reminders) still queued because deleteUserData wipes DB rows but never removes Bull jobs — currently no-op on fire. Plus a double-delivery race in schedule.service.fire() (marks FIRED then re-enqueues → at-least-once can split a chain → daily doubling).

Fixes proposed: (1) drain queue on user delete, (2) dedup daily reminder creation / deterministic jobId, (3) soften dunning second link. No code changed; temp query scripts removed.

## Outcome

- ✅ Impact: Root-caused both complaints against real prod data; identified 3 concrete bugs
- 🧪 Tests: none (read-only)
- 📁 Files: none modified
- 🔁 Next prompts: implement queue-drain-on-delete + reminder-creation dedup (branch + tests)
- 🧠 Reflection: The messages table hides link sends and per-instance dedup; the Bull/Redis queue is the ground truth for scheduling-flood questions

## Evaluation notes (flywheel)

- Failure modes observed: no dedup on reminder creation; queue not drained on delete; dunning re-sends full link; fire() re-enqueue race
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): deterministic jobId for daily reminders keyed on (userId, local_time) to make re-creation idempotent like check-ins
