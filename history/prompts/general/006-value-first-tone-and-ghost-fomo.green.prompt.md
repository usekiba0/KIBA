---
id: 006
title: Value-first paywall + playful ghost FOMO
stage: green
date: 2026-06-02
surface: agent
model: claude-opus-4-8
feature: onboarding-variants
branch: feat/onboarding-tone-pass
user: usekiba0
command: general chat (client feedback)
labels: [onboarding, tone, paywall, ghost, fomo, emojis, retention]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/ai/prompts/intake.prompt.ts (POST_LINK + PAYWALL rewritten value-first; discount handling; emoji guidance)
 - backend/src/accountability/checkin.processor.ts (buildDunningNudge → playful/FOMO/value-first + emojis)
 - backend/src/ai/prompts/ghost.prompt.ts (levels 1-6 enriched: playful lines, emojis, tough-love/cussing gated on consent)
 - backend/tests/unit/ghost.prompt.spec.ts (added cussing-gating tests)
tests:
 - npx tsc --noEmit → EXIT=0
 - jest unit (full) → 43 suites / 390 tests passed
---

## Prompt

Client feedback (with screenshot + a 5-level ghost-style spec): after the payment
link KIBA sounds money-hungry — it refuses to talk and keeps demanding payment.
Want it VALUE-FIRST: keep providing value, plant premium gently as FOMO, never a
money grab, "we're still here for them." Keep following up even after no response
to win people back once they feel the value. Make ghost/no-response follow-ups
playful, human, creative, FOMO-driven (e.g. "good thing you didn't lock in, cause
if you ghosted like this i'd be on you"). Add well-placed emojis. Question: can
KIBA send GIFs?

## Response snapshot

Three follow-up systems retuned:
1. Intake PAYWALL/POST_LINK (intake.prompt.ts): no more "refuse + point at link."
   Now lead with value, give a real taste, plant premium as gentle FOMO, mention
   the free trial at most once per reply, handle discounts with value+zero-risk
   instead of "that's all on stripe." Killed the "nothing, you go back to failing"
   energy.
2. Unpaid-lead dunning (buildDunningNudge): rewritten playful/FOMO/value-first
   with the "good thing you haven't locked in yet 😭" framing + emojis (still
   personalised with goal/obstacle, still ships a fresh link).
3. Paid-user ghost (ghost.prompt.ts): levels 1-6 enriched with the client's
   playful lines + emojis; tough-love/cussing variants (level 4 "WHERE TF YOU AT")
   now GATED on profile.cussing_ok — clean by default.
Emoji guidance added to intake tone rules. GIFs: answered separately (possible on
iMessage via SendBlue media_url, needs a small build — not done).

## Outcome

- ✅ Impact: KIBA stops feeling like a money grab post-link and keeps providing value + warmth; ghost/no-response follow-ups are playful, human, FOMO-driven, and tone-safe.
- 🧪 Tests: tsc clean; full unit suite 390/390 (added cussing-gating tests; preserved all goal-type + token invariants).
- 📁 Files: 3 src edited, 1 test edited.
- 🔁 Next prompts: GIF/media send support (curated lib or Giphy + media_url) if client wants it; consider applying [pause] bursts + emojis to the coaching prompt too.
- 🧠 Reflection: kept every existing test invariant (goal-type branching, dunning tokens, level-6 closer phrase) while reshaping tone — copy changes are the riskiest place for silent regressions.

## Evaluation notes (flywheel)

- Failure modes observed: dropped the obstacle token from nudge 0 (test caught it); changed the level-6 closer phrase a test pinned (restored it). Both caught by the unit suite.
- Graders run and results (PASS/FAIL): unit PASS (390/390); tsc PASS.
- Prompt variant (if applicable): value-first PAYWALL/POST_LINK; cussing-gated ghost levels.
- Next experiment (smallest change to try): A/B the value-first paywall vs the old hard paywall on trial-start rate.
