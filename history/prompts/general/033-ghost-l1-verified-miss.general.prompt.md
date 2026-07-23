---
id: 033
title: Ghost L1 verified-miss guards
stage: green
date: 2026-07-22
surface: agent
model: claude-opus-4-8
feature: none
branch: fix/b1-ghost-l1-verified-miss (worktree b1-slice2-ghost-l1)
user: usekiba0
command: OPTION A (worktree isolation for B1 slice 2)
labels: ["retraining-doc", "B1", "anti-ghost", "strike", "worktree", "TDD"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/35
files:
 - backend/src/accountability/anti-ghost.service.ts
 - backend/tests/unit/anti-ghost.service.spec.ts
tests:
 - tests/unit/anti-ghost.service.spec.ts (27 pass; 4 new: completed-task suppression, replied-since-check-in suppression, mid-defer-reply suppression, quiet-user-still-fires)
 - full unit suite 1125/1125; tsc clean
---

## Prompt

OPTION A

(User selected worktree isolation for B1 slice 2 — the L1 ghost gap — to avoid colliding with a parallel session working in the main checkout.)

## Response snapshot

Built in isolated worktree `.claude/worktrees/b1-slice2-ghost-l1` (node_modules junctioned from main checkout). TDD red→green. Two deterministic guards added to `AntiGhostService.onMissedCheckin` before any strike: (1) ledger guard — task status COMPLETED → no strike/no ghost/chain stays ACTIVE; (2) thread guard — any user inbound within 2.5h (checkin-missed job delay + buffer) means the check-in was answered → skip; applies on the stated-return deferred re-run too. `hasRecentInbound` gained a windowMs param. Two stated-return fixtures moved to genuinely-quiet timestamps. PR #35 squash-merged (425414d). Discovered mid-flight: parallel session shipped PR #32 (recap/weekly mid-convo defer) and PR #34 (B7 hard lines); coordination handled via shared memory file.

## Outcome

- ✅ Impact: strike/ghost L1 can no longer assert a failure the ledger or thread disproves (doc #48/#118/#129 family dead)
- 🧪 Tests: 1125/1125 unit, tsc clean
- 📁 Files: anti-ghost.service.ts + spec
- 🔁 Next prompts: ledger-correction path (unclaimed); ghost L3-6 template rewrite + B5 + full context injection (claimed by parallel session)
- 🧠 Reflection: worktree isolation + shared memory file made two concurrent sessions in one repo workable

## Evaluation notes (flywheel)

- Failure modes observed: parallel-session commits riding on a stale local master (resolved via rebase --skip)
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): ledger-correction path — dispute verification against todo/proof ledger → actual un-strike/score fix
