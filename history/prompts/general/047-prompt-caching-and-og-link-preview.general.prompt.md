---
id: 047
title: Prompt caching + OG link preview cards
stage: general
date: 2026-07-28
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (freeform implementation request)
labels: ["latency", "prompt-caching", "og-image", "checkout", "frontend"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/ai/prompts/coaching.prompt.ts
 - backend/src/ai/coaching.service.ts
 - backend/tests/unit/coaching-prompt-cache.spec.ts
 - backend/tests/unit/coaching.service.spec.ts
 - frontend/src/app/layout.tsx
 - frontend/src/app/opengraph-image.tsx
 - frontend/src/app/plan/layout.tsx
 - frontend/src/app/plan/opengraph-image.tsx
tests:
 - backend unit suite: 91 suites / 1250 tests PASS
 - new coaching-prompt-cache.spec.ts: 7 PASS
 - tsc --noEmit (backend) clean
 - next build (frontend) clean; both OG routes fetched and visually inspected
---

## Prompt

start on the prompt caching and og image

## Response snapshot

**Prompt caching.** The blocker was prompt *ordering*, not the API. `buildSystemPrompt` emitted
the volatile per-user context FIRST (name, pressure context, todos, time, score) and the ~14k-token
static rulebook after it, so no stable cache prefix existed — a breakpoint at the end of the system
prompt would have missed on every single turn.

Split `coaching.prompt.ts` into two exports:
- `COACHING_STATIC_RULES` — the rulebook, zero interpolation, byte-identical for every user on
  every turn. Because it carries nothing user-specific it is a prefix shared across ALL users: one
  person's message keeps it warm for everyone.
- `buildCoachingDynamicContext(...)` — everything volatile, now placed AFTER the breakpoint.

Only three interpolations lived in the 270-line static tail (`${user.name}` in EMOTIONAL GOAL, and
the `pressure_preference` / `cussing_ok` ternaries at the end); the name was genericized and the two
ternaries moved into a `DELIVERY SETTINGS FOR THIS PERSON` section in the dynamic half.
`buildSystemPrompt` remains as a back-compat wrapper for tests and the sim scripts.

`coaching.service.ts` now sends ordered blocks with `cache_control: { type: 'ephemeral' }` on block
0, and logs `cacheReadTokens` / `cacheWriteTokens` in the existing `ai` structured log so the real
hit rate is observable in prod (reads >> writes = healthy).

**Behavioral delta, flagged:** per-person context now sits after the rulebook instead of before it.
All 102 existing coaching-prompt assertions still pass, and recency arguably favors the per-user
facts, but this is a real change to a heavily tuned prompt and wants a live eyeball.

**Intake NOT done.** `intake.prompt.ts` interleaves its dynamic blocks through the template
(relative lines 3-12, 29, 58), so the largest contiguous static run is only ~5k tokens and
extracting it means reordering the sales script. Deferred pending a green light — conversion path,
higher risk, smaller payoff.

**OG link preview.** Root layout had `title`/`description` only, no `openGraph` and no
`metadataBase`, which is why the texted link unfurled as a bare grey compass. Added:
- `metadataBase` (`NEXT_PUBLIC_SITE_URL` → `https://onboarding.usekiba.ai`) so Next emits ABSOLUTE
  image URLs — relative ones are silently ignored by unfurlers.
- `app/opengraph-image.tsx` — site-wide fallback card.
- `app/plan/opengraph-image.tsx` — the payment-link card, a stacked "KIBA member" motif echoing the
  Tomo reference Karibi sent. Carries no price or trial length on purpose: the trial is
  referral-aware, so any baked-in number would eventually contradict the checkout page.
- `app/plan/layout.tsx` — per-route metadata (the page is `'use client'` so it can't export its
  own) plus `robots: noindex`, since a checkout link is personal.

Both routes pinned to `runtime = 'edge'`: `@vercel/og`'s node build resolves its bundled font via
`fileURLToPath` and throws `TypeError: Invalid URL` on Windows paths, failing `next build` locally.

Rendered and visually inspected both cards. First pass of the plan card overflowed — seven stacked
rows exceeded 630px, clipping the last row and pushing the caption out of frame — cut to five.

## Outcome

- ✅ Impact: the biggest latency/cost lever on the coaching path is live (~14k tokens/turn now a globally-shared cached prefix), and every KIBA link now unfurls as a branded card instead of a grey icon
- 🧪 Tests: 1250/1250 backend unit PASS (7 new cache-invariant tests), tsc clean, next build clean, both OG images fetched + eyeballed
- 📁 Files: 8 (4 new)
- 🔁 Next prompts: deploy + read `cacheReadTokens` vs `cacheWriteTokens` from prod logs to confirm the hit rate; live-eyeball KIBA's tone after the prompt reorder; decide on intake caching; then pin-GIF env fix, success page + CTA, Stripe dashboard items
- 🧠 Reflection: prompt caching is a prompt-ARCHITECTURE problem before it's an API one — the win is unreachable until the static half is a genuine prefix, and nothing fails loudly if it isn't

## Evaluation notes (flywheel)

- Failure modes observed: a cache breakpoint over a non-stable prefix degrades silently (costs MORE, no speedup, no error) — hence the invariant tests and the read/write token logging
- Graders run and results (PASS/FAIL): backend unit suite PASS; OG cards PASS on visual inspection after the row-count fix
- Prompt variant (if applicable): coaching system prompt reordered — static rulebook first, per-person context second
- Next experiment (smallest change to try): compare `cacheReadTokens` against turn latency in prod for 24h; if hit rate is high but gaps hurt, evaluate the 1h extended cache TTL
