---
id: 084
title: Adaptive photo burst debounce window
stage: general
date: 2026-08-03
surface: agent
model: claude-opus-5[1m]
feature: none
branch: fix/adaptive-photo-burst-window
user: usekiba0
command: follow-up to PHR 083 ("do it")
labels: ["debounce", "vision", "media", "latency", "prod-measurement"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/73
files:
 - backend/src/messaging/message-debouncer.service.ts
 - backend/src/messaging/inbound-media.ts
 - backend/src/ai/coaching.service.ts
 - backend/tests/unit/message-debouncer.service.spec.ts
 - backend/tests/unit/coaching.service.spec.ts
tests:
 - message-debouncer.service.spec.ts (prod gap replay + 5 delay cases)
 - coaching.service.spec.ts (cap asserted against the shared constant)
 - full unit + contract: 1617 passing, 1 suite / 4 tests skipped (needs live Postgres)
---

## Prompt

do it

(Build the adaptive debounce window, after prod evidence showed a real user's
6-photo dump splitting into three turns under the flat 4000ms window.)

## Response snapshot

**The measurement.** PRs #71/#72 went live at 14:00Z. At 15:57Z a REAL user
(`+92…`, Pakistan, user `1859aaf4`) sent 6 photos. Confirmed working: rows with
`pics=2` and `pics=3`, `path:"vision"`, replies naming multiple subjects from one
batch, `max_batch` 1 → 3. The 4000ms window was also confirmed live three ways —
a single-photo turn logged `debounceMs:4000` exactly, and the batch turns logged
7351 and 9823 = sum(gaps) + 4000.

**The new problem.** That user's arrival gaps were **3349 / 5306 / 3057 / 2764 /
5899 ms**. Two exceeded 4000, so the dump split into three turns and KIBA sent
three replies — the first two redundantly describing the same SSD and the same
fintech panel. My 14-day sample had been entirely founder testing on US wifi,
maxing at 2793ms. **The first real user roughly doubled it.**

**Correction carried forward.** I had earlier killed the "extend once a burst is
known" idea because the founder sample showed 1→2 was always the slowest gap.
This user shows no positional pattern (the slow gaps were 2→3 and 5→6), so that
retraction was right about that data and wrong as a general rule.

**The fix.** Adaptive rather than a bigger flat window: first photo waits 4000ms;
once a SECOND photo is buffered the burst is confirmed and the timer extends to
8000ms (env-tunable). Single-photo turns — the common case — pay nothing. Delay
is chosen by counting MEDIA, not messages, so a photo plus a text bubble stays on
the fast window.

**The coupled change.** `MAX_TURN_IMAGES` 4 → 6 in the same commit. These MUST
move together: a 6-photo dump merged into one turn but capped at 4 would show the
model FEWER photos than the old split-turn behaviour did — a coverage regression
hiding inside a fix. The cap now lives only in `inbound-media.ts`;
`coaching.service` imports it instead of keeping a local `const MAX_IMAGES = 4`
that silently re-truncated a batch the processor had already sized.

## Outcome

- ✅ Impact: a real-world photo dump lands as ONE turn and ONE reply; single-photo latency unchanged.
- 🧪 Tests: prod gap sequence replayed as a regression test asserting one turn with all 6 photos; 1617 passing; `tsc --noEmit` clean.
- 📁 Files: 3 source, 2 specs.
- 🔁 Next prompts: after deploy, watch for a single `[Debounce] merged 6 webhooks` with `debounceMs ≈ 8000+` and a `pics=6` row; dial `MESSAGE_IMAGE_BURST_DEBOUNCE_MS` down if perceived latency complaints appear.
- 🧠 Reflection: two silent caps in different modules were about to disagree. The one that would have bitten is the kind that never errors — it just quietly shows the model less than you think it sees.

## Evaluation notes (flywheel)

- Failure modes observed: a window tuned entirely on founder traffic broke on the first real user; and a fix (merging) that would have *reduced* coverage if the paired cap hadn't moved with it.
- Graders run and results (PASS/FAIL): unit + contract PASS (1617); typecheck PASS.
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): log the observed inter-arrival gap per burst so the window can be tuned from a real distribution instead of anecdotes.
