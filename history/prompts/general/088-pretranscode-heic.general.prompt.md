---
id: 088
title: Pre-transcode HEIC during the debounce window
stage: general
date: 2026-08-04
surface: agent
model: claude-opus-5[1m]
feature: none
branch: perf/pretranscode-heic
user: usekiba0
command: "now do the vision reply length" -> measured, redirected, then "yes"
labels: ["latency", "vision", "media", "heic", "prod-measurement"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/78
files:
 - backend/src/messaging/image-prep.ts (new)
 - backend/src/messaging/message-debouncer.service.ts
 - backend/src/ai/coaching.service.ts
 - backend/tests/unit/image-prep.spec.ts (new)
 - backend/scripts/sim-vision-latency.ts (new)
tests:
 - image-prep.spec.ts (11 cases: dedup, in-flight sharing, failure eviction, memory bound)
 - full unit + contract: 1645 passing, 1 suite / 4 tests skipped (needs live Postgres)
---

## Prompt

now do the vision reply length

## Response snapshot

**The task was based on a wrong premise, and measuring first is what caught it.**

I was asked to shorten vision replies to cut `genMs`. Before editing KIBA's voice
I built `scripts/sim-vision-latency.ts` — real coaching prompt, real inbound
photos, two samples per cell:

| cell | genMs | out |
|---|---|---|
| 1 img, normal | 3113 | 60 tok |
| 3 img, normal | 3228 | 76 tok |
| 1 img, BRIEF | 2563 | 27 tok |
| 3 img, BRIEF | 2682 | 29 tok |

**+2 images = +115ms. Forcing a reply to a third of its length = −550ms.** The API
call is ~3.1s; prod photo turns were 9.5–36s. Rewriting the prompt would have
degraded the voice to recover half a second. The `genMs ≈ 1624ms + 8ms/token` law
from 07-30 is a TEXT-turn law and does not carry to vision.

**The real cost:** transcoding iPhone HEIC. Per photo, fetch 0.6–2.2s +
`heic-convert` 2.2–5.5s = **2.9–7.5s each**, run in a serial `for`-await loop, so
three photos = **17.8s** before the model saw anything.

Verified dead ends first: the API still **rejects HEIC by URL** (HTTP 400), so
conversion is mandatory; and `sharp` is already a dependency advertising HEIF
input but its decoder plugin **is not built in** ("support for this compression
format has not been built in").

**The fix:** the debouncer already idles 4–8s while a dump uploads 2–6s apart —
dead time we already spend. Transcoding now starts when each photo's webhook
lands, keyed by URL, so the JPEG is normally ready before the turn flushes.
Caching the PROMISE (not the result) means a turn flushing mid-conversion awaits
the same work rather than starting a duplicate. Also parallelised the block-prep
loop (~4.5s on a cold 3-photo turn).

A unit test caught a real defect: `transcode` resolves `ok:false` instead of
rejecting, so a plain `.catch()` never fired and one CDN blip would have pinned
"couldn't open that photo" to a URL for the full TTL. Failures are now evicted.

## Outcome

- ✅ Impact: 2.9–7.5s per HEIC photo moves off the reply path; expect photo turns ~30s → ~12–15s perceived.
- 🧪 Tests: 11 new (dedup, in-flight sharing, failure eviction+retry, memory bound); 1645 passing; `tsc` clean.
- 📁 Files: 2 new source/spec, 1 new script, 2 edited.
- 🔁 Next prompts: send a photo dump and compare `perceivedMs` against the 30.3s mean; check the cache bound holds under a 19-photo burst.
- 🧠 Reflection: the instruction was specific and wrong, and following it literally would have produced a real cost (worse voice) for no gain. The measurement took ~20 minutes. Worth remembering that "genMs is high" had a well-established explanation from a previous investigation that simply did not apply to this path.

## Evaluation notes (flywheel)

- Failure modes observed: carrying a measured law (`8ms/output-token`) across contexts where it doesn't hold; and a cache that would silently memoise failures because the producer resolved rather than rejected.
- Graders run and results (PASS/FAIL): unit + contract PASS (1645); typecheck PASS.
- Prompt variant (if applicable): none shipped — the brevity instruction was tested and rejected on evidence.
- Next experiment (smallest change to try): log a `transcodeMs`/cache-hit field so the pre-warm hit rate is visible rather than inferred.
