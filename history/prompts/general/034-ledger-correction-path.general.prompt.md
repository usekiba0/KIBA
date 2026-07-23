---
id: 034
title: Ledger correction path shipped
stage: green
date: 2026-07-22
surface: agent
model: claude-opus-4-8
feature: none
branch: feat/b1-ledger-correction (worktree b1-slice2-ghost-l1)
user: usekiba0
command: yes (approve ledger-correction slice)
labels: ["retraining-doc", "B1", "ledger-correction", "coaching-tool", "TDD"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/36
files:
 - backend/src/accountability/ledger-correction.service.ts (new)
 - backend/src/accountability/accountability.module.ts
 - backend/src/ai/coaching.service.ts
 - backend/src/ai/prompts/coaching.prompt.ts
 - backend/src/messaging/coaching.processor.ts
 - backend/tests/unit/ledger-correction.spec.ts (new)
 - backend/tests/unit/coaching.prompt.spec.ts
tests:
 - 6 new LedgerCorrectionService tests + 1 prompt pin; full suite 1132/1132; tsc clean
---

## Prompt

yes

(Approval to build the ledger-correction path — the last unclaimed B1 piece — in the worktree.)

## Response snapshot

Retraining doc #49/#127: KIBA conceded wrong strikes in prose while the DB kept the false miss. Shipped PR #36: LedgerCorrectionService.correctMiss (task MISSED→COMPLETED, strikes deleted, dow miss-counter decremented with zero-clamp, score recomputed; today/yesterday window only), new coaching tool correct_missed_task with tight anti-abuse description, prompt rule under HARD LINES ownership making the tool call mandatory behind any "score's fixed" concession (size budget 31.1k→31.2k documented). TDD red→green throughout.

## Outcome

- ✅ Impact: the #48→#49→#126→#127 concede-then-re-accuse loop is dead — concessions now fix the DB
- 🧪 Tests: 1132/1132 unit, tsc clean
- 📁 Files: 7 (2 new)
- 🔁 Next prompts: other session holds ghost L3-6 templates + B5 math guard + full context injection
- 🧠 Reflection: mirroring logStrike's increment exactly (incl. dow clamp) made the correction provably symmetric

## Evaluation notes (flywheel)

- Failure modes observed: prompt size budget tripwire caught rule verbosity — tightened rule, then bumped budget with documentation per B7 precedent
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): sim-harness turn exercising a dispute → verify the model actually calls the tool
