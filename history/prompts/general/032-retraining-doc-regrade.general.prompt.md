---
id: 032
title: Retraining doc re-grade vs master
stage: general
date: 2026-07-22
surface: agent
model: claude-opus-4-8
feature: none
branch: master
user: usekiba0
command: continue (resume session)
labels: ["retraining-doc", "scheduled-layer", "re-grade", "B1-context-injection"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - (none modified — analysis only)
tests:
 - (none run — analysis only)
---

## Prompt

comtinue

(Resumed session; queued task per memory: start KIBA_Retraining_Doc.pdf work — step 1 = re-grade the 133-message graded doc against current master before building anything.)

## Response snapshot

Extracted and read all 34 pages of KIBA_Retraining_Doc.pdf (bugs B1–B9, founder principles, P0/P1/P2, keep-list). Verified PR states: #15 (event-timing guard) MERGED, #19 MERGED, #14 closed-superseded-by-#22. Ran a very-thorough code exploration mapping all 10 scheduled/triggered sender classes (morning check-in, night recap, weekly review, anti-ghost, reminders, surprise, strike/score, dunning, intake nudge, day-7/milestone/faith) — per class: compose site, render type, state injected, guards.

Re-grade result: B2 FIXED (supersede+dedup), B9 mostly FIXED (residual: typo-correction double replies since debounce is off), B3 PARTIAL (false-claim guard exists; untimed promises still unenforced), B4 PARTIAL (real-ledger reads in recap/weekly/day-7/milestone; residual: unconditional strike, no in-thread score correction), B1 PARTIAL-OPEN (ledger-state injection largely done; conversation-state injection absent — zero scheduled sender reads history for rendering; no shared context builder; ghost/surprise/reminders/dunning/milestone/price-reveal/intake-nudge NOT persisted as Message rows so invisible to the live layer), B5 OPEN (no arithmetic layer), B7 OPEN (prompt rules), B6/B8 Phase 2.

New bug found during mapping: anti-ghost L1 (`onMissedCheckin`) fires strike + ghost without checking task completion or recent inbound (90-min backstop only covers L2-6); `logStrike` flips task MISSED unconditionally.

## Outcome

- ✅ Impact: authoritative re-graded status for every doc bug; B1 build scope defined (shared ScheduledContext + pre-send gates + persist-all-outbound + L1 fix)
- 🧪 Tests: none (analysis)
- 📁 Files: none modified
- 🔁 Next prompts: build B1 context injection; then B5 math-claim guard; then B7 prompt rules
- 🧠 Reflection: much of the doc's P0 was already dead on master — re-grading first avoided rebuilding fixed things

## Evaluation notes (flywheel)

- Failure modes observed: stale memory (PR #15 marked unmerged but was merged)
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): B1 slice 1 = persist all scheduled outbound as Message rows (cheapest, unblocks live-layer ownership)
