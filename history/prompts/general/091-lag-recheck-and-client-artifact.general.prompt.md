---
id: 091
title: Schedule lag re-check and build client before/after
stage: general
date: 2026-08-05
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: "can you do that" -> disambiguated to BOTH (schedule 08-08 re-run + build before/after for Karibi)
labels: ["latency", "sendblue", "client-comms", "scheduling", "artifact"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - scratchpad/sendblue-lag-before-after.html (published artifact, not in repo)
tests:
 - (none run)
---

## Prompt

can you do that

## Response

"That" was ambiguous between two different pieces of work, so asked; user chose **both**.

### 1. Client-facing before/after page

Published: https://claude.ai/code/artifact/61566337-c554-4dea-afa7-9d88f644eec4 (private until shared)

Design decision: the central device is a dashed vertical marker at the OLD p90 (4738ms).
Today's worst-case bar (4710ms) stops just short of it, so "our worst message today beats
a routine slow message two days ago" reads visually before any number is parsed.

Written for a non-technical founder: "typical / slow 1 in 10 / worst message" rather than
p50/p90/max. Kept two honesty guards on the page — the n=86 single-day caveat, and a
dashed, explicitly-labelled "estimated, not instrumented" segment for the send-back leg
of the turn timeline.

Two build bugs caught and fixed before publishing:
- The dashed marker was positioned at 46.3% of the chart, but the bar tracks are inset by
  the 3.6rem label column + 0.6rem gap. Fixed with
  `left: calc(4.2rem + (100% - 4.2rem) * 0.463)`.
- The turn-timeline legend swatch used the "after" green for a category rendered in the
  "before" red on the first row. Replaced with a two-swatch before/now pair.

### 2. Scheduled confirmation re-run

Routine `trig_016Rfgb6Qc87NuEdjf6kmPQZ`, one-shot, fires 2026-08-08T05:07:00Z
(10:07am Asia/Karachi). https://claude.ai/code/routines/trig_016Rfgb6Qc87NuEdjf6kmPQZ

**It is a REMINDER, not the measurement.** Two hard blockers, both surfaced to the user
rather than papered over:

1. `backend/.env` is gitignored (`.gitignore:13`, confirmed via `git check-ignore -v`), so
   a cloud agent's fresh checkout has no `RENDER_API_KEY` / `RENDER_SERVICE_ID` /
   `RENDER_OWNER_ID`. The script cannot reach Render's logs API. Deliberately did NOT put
   those credentials into the routine config.
2. The first `create` returned HTTP 401 — "Connect your GitHub account before saving a
   routine that uses a GitHub repository." Recreated with no repo source at all, which is
   fine given (1).

The routine prompt therefore carries the full self-contained context (baseline table, the
08-05 reading, the exact local commands, and the migrate-vs-stay decision fork) so it is
useful on its own without a checkout.

Rejected alternative: `CronCreate` is session-only and in-memory, so it cannot survive
three days to 08-08.

## Outcome

- No code changed.
- Follow-up: to make future re-checks self-running, GitHub must be connected via
  `/web-setup` AND the Render credentials supplied to the cloud environment. Not worth it
  for a single run.
