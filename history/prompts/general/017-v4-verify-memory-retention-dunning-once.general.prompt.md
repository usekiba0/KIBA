---
id: 017
title: V4 Piece 1 verify + RC-3 memory retention + dunning link once
stage: general
date: 2026-06-29
surface: agent
model: claude-opus-4-8
feature: none
branch: master
user: usekiba0
command: (chat)
labels: ["intake", "memory", "session-boundary", "dunning", "payment", "goal-type", "bugfix", "audit"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/messaging/coaching.processor.ts
 - backend/src/data/session-boundary.service.ts
 - backend/src/accountability/checkin.processor.ts
tests:
 - backend/tests/unit (794 passed, tsc clean)
---

## Prompt

After a full feedback-doc audit (issues docx, mock convos, V4 Dev Notes, 06-01 feedback), the user said "work on a b and c":
- (a) deploy V4 Piece 1 (intake diagnostic rewrite)
- (b) the session-cap memory wipe (RC-3)
- (c) the small ones — #10 dunning link sent 3×, #11 goal-type check-ins

## Response snapshot

Mapped each area with read-only agents/greps before editing; two of the four turned out to be already-shipped.

(a) ALREADY LIVE — no change. `git log` shows commit `4886240 feat(intake): diagnostic conversation engine, kill scripted responses (V4 Piece 1)` on master plus four refinements (`720f122` converge-on-the-move, `425ddef`, `4373530`, `7e6dd10`). Verified `intake.prompt.ts:135-145` carries the `learn → understand → diagnose → close` sequence and explicitly BANS "what usually makes you fold" and "why does it matter," and does business-type-first diagnosis. The 06-24 "built, not deployed (awaiting sign-off)" memory note was stale — it was merged.

(b) RC-3 memory retention — tuned, not re-architected. History is already cross-session (fetched by user_id, not session_id — fixed 06-24), and the relationship digest only overwrites on success (failure never wipes). The residual: an active back-and-forth hit the 30-msg session boundary fast and leaned on the async Layer-2 digest before it absorbed the session → "KIBA forgot what we just said." Fix: `COACHING_HISTORY_LIMIT` 40→60 and `MESSAGE_COUNT_THRESHOLD` 30→50, with the window kept above the threshold so the raw-history window always spans a full session + its boundary. Cheap on Haiku; no latency-relevant change.

(c) #10 dunning — `MAX_DUNNING_NUDGES` 3→1 (`checkin.processor.ts`). Was dripping 3 link-resends (2.5h/~24h/~2-3d); now a single ~2.5h follow-up that still ships one live link (so leads aren't stranded), resent only on request thereafter. Strict zero-auto-resend is a one-line follow-up if Karibi wants it.

(c) #11 goal-type check-ins — ALREADY HANDLED, no change. `goal-classifier.ts` + `goal.entity.goal_type` + migration `1780100000000` classify every goal; `ghost.prompt.ts` branches on goalType; `coaching.prompt.ts:332` says a long-term goal is NOT yes/no ("translate it to today's move"). The morning check-in uses today's daily *action* (`humanizeTask` → "what time?"), never "happen or nah" on a long-term goal. Grep confirms "happen or nah"/"did it happen" only appears in goal-type-aware contexts (ghost TASK branch + dated-commitment proof check).

## Outcome

- ✅ Impact: V4 Piece 1 confirmed live; KIBA retains ~60 raw turns and churns sessions at 50 not 30 (less "it forgot"); payment link no longer auto-resent 3×.
- 🧪 Tests: 794/794 unit pass; tsc clean. No test asserted the old constants; dunning-nudge.spec tests only the text builder (indices 0-2), unaffected.
- 📁 Files: coaching.processor.ts (history 40→60), session-boundary.service.ts (threshold 30→50), checkin.processor.ts (dunning 3→1).
- 🔁 Next prompts: optional strict zero-auto-resend dunning; deeper RC-3 (retry/rebuild of relationship digest on failure) if "forgot" recurs past 60 turns.
- 🧠 Reflection: half of "a/b/c" was already shipped — auditing before editing avoided re-doing live work and kept the diff to three constants.

## Evaluation notes (flywheel)

- Failure modes observed: stale memory note ("V4 not deployed") vs git reality; 30-msg boundary over-churning active convos.
- Graders run and results (PASS/FAIL): unit suite PASS (794/794), tsc PASS.
- Prompt variant (if applicable): none (config-only changes).
- Next experiment (smallest change to try): real-convo check that a 50+ message relationship still references early facts; confirm one dunning nudge converts comparably.
