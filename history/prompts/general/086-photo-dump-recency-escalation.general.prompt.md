---
id: 086
title: Recency escalation for long photo dumps
stage: general
date: 2026-08-03
surface: agent
model: claude-opus-5[1m]
feature: none
branch: fix/photo-dump-recency-escalation
user: usekiba0
command: follow-up to a 12-photo prod test ("yes")
labels: ["debounce", "media", "latency", "prod-measurement", "sendblue"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/75
tests:
 - message-debouncer.service.spec.ts (32 cases incl. the 12-photo prod arrival replay)
 - full unit + contract: 1634 passing, 1 suite / 4 tests skipped (needs live Postgres)
files:
 - backend/src/messaging/message-debouncer.service.ts
 - backend/tests/unit/message-debouncer.service.spec.ts
---

## Prompt

yes

(Agreeing to build the per-user recency escalation plus the cap flush, after a
12-photo prod send split into six turns and produced five per-photo replies.)

## Response snapshot

**What prod showed.** 12 photos sent "together" arrived over **44.8 seconds**,
gaps 2065–6046ms, landing as SIX turns: five lone photos each answered
separately, then one batch of seven. `max_batch` reached 7, so the batch
*reading* and *persistence* were fine — the failure was purely turn boundaries.

**Hypothesis disproved.** I suspected SendBlue was spreading out simultaneous
sends. The `providerLagMs` field shipped hours earlier settled it: span at
SendBlue **44998ms** vs **44773ms** at our end — inflated by **−225ms**. The
provider does not create the gaps; Apple's sequential attachment upload does.
**No vendor migration would fix this**, which is a direct answer to the
"should we move off SendBlue" question.

**Why the adaptive window only half-worked.** It can only fire once TWO photos
are co-buffered, and photos 1–5 each had a gap exceeding the 4000ms BASE window,
so each flushed alone before its successor arrived. Only the tail merged. **The
base window gates the entire mechanism** — I'd fixed the second-order problem
while the first-order one stayed open.

**Why not just raise the base.** Covering 6046ms would merge all 12 into one
reply after ~53s of silence, and would tax every single-photo turn.

**Shipped instead:**
1. **Recency escalation** — if a media-bearing batch flushed for this sender
   within `MESSAGE_PHOTO_RECENCY_MS` (15s), a following lone photo uses the burst
   window. The first photo still answers fast, so the common case pays nothing.
2. **Cap flush** — once buffered media hits `MAX_TURN_IMAGES`, flush immediately.
   Waiting longer cannot show the model more, and this bounds a long dump.

Replaying the exact prod arrival sequence: **six turns → three**, all 12 photos
accounted for, no turn over the cap, first reply still fast.

## Outcome

- ✅ Impact: a long photo dump yields ~3 bounded replies instead of 6 per-photo ones; single-photo latency unchanged.
- 🧪 Tests: prod arrival sequence replayed as a regression test; 32 debouncer cases; 1634 passing; `tsc` clean.
- 📁 Files: 1 source, 1 spec.
- 🔁 Next prompts: re-run a 12-photo send after deploy and count turns; consider whether 3 replies is still too many.
- 🧠 Reflection: third pass at this window. Each earlier version was right about the data available at the time — the lesson is that arrival-timing assumptions need the widest real sample before being encoded, and that a mechanism gated by a threshold (the base window) can look adaptive while never actually engaging.

## Evaluation notes (flywheel)

- Failure modes observed: an escalation that could not trigger because its precondition depended on the very threshold it was meant to relax; and a plausible provider-blame hypothesis that measurement disproved.
- Graders run and results (PASS/FAIL): unit + contract PASS (1634); typecheck PASS.
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): log per-burst arrival gaps so the base window can be set from a distribution across many users rather than three anecdotes.
