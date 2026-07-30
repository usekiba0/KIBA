---
id: 072
title: Vision model flipped to Sonnet 5
stage: general
date: 2026-07-30
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (freeform)
labels: ["vision", "latency", "model-selection", "render", "prod-change"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/60
files:
  - "Render env: AI_VISION_MODEL=claude-sonnet-5 (prod change, no code)"
  - history/prompts/general/072-vision-model-flip-sonnet-5.general.prompt.md
tests:
  - "backend/scripts/sim-vision.ts — side-by-side sonnet-4-6 vs sonnet-5"
  - "PR #60 CI: Backend Lint+Test SUCCESS, Frontend SUCCESS"
---

## Prompt

yes / set it / do it

(three consecutive go-aheads: start the vision model decision → set the env var →
merge PR #60)

## Response snapshot

### The decision, and the prediction that was wrong

I expected **Sonnet 5 to be SLOWER** on vision: it has a new tokenizer (~30% more
tokens for the same text) and high-resolution vision (2576px, up to ~3× the image
tokens of Sonnet 4.6). Both point at more prefill.

`sim-vision.ts` said the opposite:

| Call | Sonnet 4.6 | Sonnet 5 | Δ |
|---|---|---|---|
| Proof verdict | 4,310 ms | **2,480 ms** | −42% |
| Photo read | 4,522 ms | **2,691 ms** | −41% |
| Input tokens | 1,622 / 1,593 | 2,158 / 2,114 | **+33%** |

It processes a third more tokens and still finishes in under half the time. The
token-count prediction was right and the latency conclusion drawn from it was wrong.

Quality on the same image: both correctly rejected a non-proof photo (0.95 vs 0.97);
Sonnet 5's read was tighter and volunteered "not food, so no calorie estimate
applies". Sonnet 4.6 emitted markdown (`**bold**`, bullets), which the coaching
prompt bans on a phone.

`deterministicParams()` did its job — the 128-token proof verdict returned valid
JSON under `thinking:{type:'disabled'}`, so the silent-truncation fail-open that
`model-params.ts` exists to prevent did not occur.

### Where the vision time actually goes

`genMs` on the vision path measures **only `generateReply`** — `validateProofFromUrl`
runs before `genStart`, so it is invisible to that metric. Budget for the 14.7s p50:

- 3.0 s debounce
- **~3.5 s unaccounted** (proof image download + the *second* vision model call + task lookup)
- 7.7 s `generateReply`
- 0.5 s send

So a photo turn with a pending task makes **two** vision model calls. At −41% each,
projected p50 goes **14.7 s → ~9.8 s**.

Also checked and dismissed: `sniffRemoteMediaType` uses `Range: bytes=0-63`, so the
image is *not* downloaded twice. That suspicion was wrong.

### Prod change

`AI_VISION_MODEL` was **not set in Render at all** — prod ran the code default
`claude-sonnet-4-6`. Set to `claude-sonnet-5`; verified 31 vars, none lost.

**Two traps, both real:**

1. `PUT /v1/services/{id}/env-vars` (**plural**) REPLACES the entire env list — it
   would have wiped `DATABASE_URL`, Twilio, SendBlue and Stripe credentials. Backed
   up all 30 vars first, then used the single-key form
   `PUT /v1/services/{id}/env-vars/{KEY}`.
2. **Setting an env var via the API does NOT trigger a deploy.** `ConfigService`
   snapshots `process.env` at boot, so the value sat stored while the live instance
   kept using Sonnet 4.6. A prior memory note said "no deploy needed" — wrong, and
   corrected. Had to `POST /v1/services/{id}/deploys` explicitly. Without it the
   change would have looked successful and done nothing.

Verified after: health 200 at ~340 ms TTFB, `/v1/version` = `f157c68`, clean boot
logs (the one "error-ish" line was my own grep matching `"failed":0` in a healthy
`schedule_all_done`).

### PR #60 merged

CI green (Backend Lint+Test, Frontend, Vercel). Squash-merged as `f7d768f`.

### Held back deliberately

**`MESSAGE_IMAGE_DEBOUNCE_MS` left at 3000.** Not because it is wrong to lower, but
because the vision model changed minutes earlier — changing the photo debounce in the
same window makes a vision regression unattributable. One variable at a time when a
measurement is about to be read. 1500 also remains known-bad (2026-06-25 per-photo
replies), so any step down goes 3000 → 2000 first, under observation.

## Outcome

- ✅ Impact: ~5 s off the vision turn (14.7 s → ~9.8 s projected) from one env var;
  PR #60's reply-length and DB-hop cuts merged and deploying.
- 🧪 Tests: sim-vision side-by-side; PR #60 CI green; post-deploy health + version +
  log check.
- 📁 Files: no code changed for the vision flip — it was config, as designed by PR #52.
- 🔁 Next prompts: re-read `turn_latency` in ~a week (does `outputTokens` p90 fall
  from 298? does vision p50 fall from 14.7 s?); re-run sim-vision on a REAL proof
  photo; step the image debounce 3000 → 2000 once vision is known-good.
- 🧠 Reflection: three predictions this session, three wrong — caching would cut
  latency (no), Sonnet 5 would be slower (no), the image was downloaded twice (no).
  Every one was caught by measuring rather than reasoning. The pattern is the lesson.

## Evaluation notes (flywheel)

- Failure modes observed: (a) predicted Sonnet 5 slower from correct token-count
  reasoning — the inference was wrong, the sim caught it; (b) nearly used the plural
  env-var endpoint, which would have destroyed every prod credential; (c) the env var
  silently did nothing until a deploy was forced.
- Graders run and results (PASS/FAIL): PR #60 CI PASS; post-deploy health PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): one `sim-vision.ts` run against a genuine
  gym/meal proof photo — the accuracy check so far is a single logo, and this model
  now decides whether a user's evidence counts.
- ⚠️ **2026-09-01**: Sonnet 5 introductory pricing ($2/$10 per MTok) ends. It is ~14%
  cheaper than Sonnet 4.6 today and ~29% more expensive after.
