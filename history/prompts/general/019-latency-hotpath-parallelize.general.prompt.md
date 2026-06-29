---
id: 019
title: Latency — parallelize todo-seeding + concurrent persist in the reply hot path
stage: general
date: 2026-06-29
surface: agent
model: claude-opus-4-8
feature: none
branch: fix/karibi-feedback-2026-06-29
user: usekiba0
command: (chat)
labels: ["latency", "performance", "coaching-processor", "hot-path"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/8
files:
 - backend/src/messaging/coaching.processor.ts
tests:
 - backend/tests/unit (794 passed, tsc clean)
---

## Prompt

Issues-doc #1: "responses slow, want nearly instant." User chose "target real latency levers" over prompt-caching (caching is a cost win needing a risky prompt reorder; the actual complaint is latency).

## Response snapshot

Profiled the latency contributors. Most big levers are locked or model-bound:
- Debounce (2s text / 3s image) is deliberately tuned to fix the Bett/Karibi bubble-split + multi-image-spam bugs — reducing it reverses those. OFF the table.
- max_tokens 512 can't drop without truncating the deliverables KIBA builds (plans/grocery lists). OFF.
- Tool round-trips are model-bound (Haiku); MAX_TOOL_ITERATIONS=3, parallel tool use already allowed.

Shipped the two zero-behavior-risk structural wins (coaching.processor.ts):
1. **Todo seeding folded into Phase 1.** `ensureSeededForToday` was a separate blocking `await` before generateReply in BOTH the vision and text branches. Moved it into the Phase-1 `Promise.all` so its once-a-day seeding write overlaps the crisis-classify LLM call; both branches reuse `seededTodos`. Idempotent (cheap read after first-of-day). Dedups the two calls too.
2. **Concurrent persist in saveAndSend.** The AI-message DB write + Redis session-cache write used to sit in front of the first bubble. Now they run concurrently with the send loop and are awaited at the end (next-turn ordering unaffected) — trims the writes out of time-to-first-bubble.

## Outcome

- ✅ Impact: ~50-300ms off perceived time-to-first-reply (first-of-day seeding now hidden behind the crisis call; DB+Redis writes overlapped with send). Safe — no behavior change.
- 🧪 Tests: 794/794 unit pass; tsc clean.
- 📁 Files: coaching.processor.ts (Phase-1 todo seed, 2 call-site reuses, saveAndSend concurrent persist).
- 🔁 Next prompts: bigger levers need a decision — (a) shave debounce (risks bubble-split regression), (b) skip the post-tool generation when the model already produced full reply text (risks truncated replies), (c) stream-to-bubbles (complex). Each a tradeoff, not a free win.
- 🧠 Reflection: the honest finding is latency here is dominated by debounce (locked) + Haiku inference (model-bound); the safe structural wins are modest. Bigger gains require accepting a tradeoff.

## Evaluation notes (flywheel)

- Failure modes observed: per-day seeding write + persist writes were serialized in front of the reply.
- Graders run and results (PASS/FAIL): unit suite PASS (794/794), tsc PASS.
- Prompt variant (if applicable): none (hot-path reorder only).
- Next experiment (smallest change to try): instrument real TTFB (inbound→first send) to quantify the win and locate the next bottleneck before touching debounce/tool-loop.
