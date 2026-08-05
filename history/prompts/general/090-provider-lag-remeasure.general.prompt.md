---
id: 090
title: Re-measure SendBlue forwarding lag after fix
stage: general
date: 2026-08-05
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: "run the provider lag report"
labels: ["latency", "sendblue", "provider-lag", "prod-measurement", "migration-decision"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - (none — read-only measurement)
tests:
 - backend/scripts/provider-lag-report.js run at DAYS=4, DAYS=2, DAYS=1
---

## Prompt

run the provider lag report

## Response

Ran `node scripts/provider-lag-report.js` from `backend/` at three windows. Read-only
(Render logs API only).

| window | method A (`providerLagMs`) | method B (recomputed from raw payloads) |
|---|---|---|
| last 4d | n=142 p50=2012 p90=4463 max=8500, >2s 50% | n=222 p50=2202 p90=4974 max=10225, >2s 63% |
| last 2d | n=142 p50=2012 p90=4463 max=8500, >2s 50% | n=174 p50=2104 p90=4710 max=8060, >2s 56% |
| **last 24h** | **n=86 p50=1742 p90=2873 max=4710, >2s 29%** | n=86 p50=1742 p90=2874 max=4710, >2s 29% |

vs BASELINE 2026-08-03: n=104 p50=2601 p90=4738 max=10225 (vendor's own clocks:
p50 2800, p90 4500, max 7900, ~97% of events >2s).

**Verdict: SendBlue shipped a fix. Do NOT migrate.**

Findings worth keeping:

1. **The tail is the story, not the median.** p50 moved −33% (2601→1742) but p90
   moved −39% (4738→2873) and max −54% (10225→4710). Today's worst case is better
   than the old p90. `>2s` fell from ~97% (vendor-measured) to 29%. Impatient-user
   complaints come from the tail, so this is the commercially relevant number.

2. **Method A cannot be narrowed below ~2 days.** `providerLagMs` only began being
   logged when the metric shipped 2026-08-04, so DAYS=4 and DAYS=2 both return the
   identical n=142. Method B reaches further back via raw payloads. This also means
   the 4d method-A figure was never diluted by pre-fix data.

3. **Both methods agree exactly in the 24h slice** (n=86, p50 1742 vs 1742, max 4710
   vs 4710) — an independent cross-check that the improvement is real and not an
   instrumentation artifact.

**Caveat flagged to the user:** n=86 over a single day; lower traffic could partly
explain faster dispatch. Direction is consistent across all three windows, but
re-run in ~3 days before telling the client it is permanent.

Revised fast-TEXT-turn budget: provider inbound ~1.7s + text debounce 0ms + genMs
(1624ms + 8.0ms/output-token) ≈ 4.5–5.5s, down from 5.5–7s. Updated the client
draft reply to Karibi accordingly (PHR 089).

## Outcome

- No code changed.
- Memory `project_kiba_sendblue_forwarding_lag_2026_08_03` updated with the
  re-measurement, the DAYS gotcha, and the DO-NOT-MIGRATE decision.
- Follow-up: re-run ~2026-08-08 to confirm the gain holds at higher traffic.
