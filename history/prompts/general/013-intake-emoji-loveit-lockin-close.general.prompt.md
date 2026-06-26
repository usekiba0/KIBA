---
id: 013
title: Intake emoji/love-it scrub + lock-in close framing
stage: green
date: 2026-06-26
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: master
user: usekiba0
command: general
labels: ["intake", "onboarding", "voice-scrub", "payment-link", "client-feedback"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/messaging/voice.ts
 - backend/src/messaging/coaching.processor.ts
 - backend/src/ai/prompts/intake.prompt.ts
 - backend/tests/unit/voice.spec.ts
 - backend/tests/unit/intake-prompt.spec.ts
 - docs/REGRESSION_CHECKLIST.md
tests:
 - tests/unit/voice.spec.ts (scrubIntakeVoice: emoji + filler-opener strip)
 - tests/unit/intake-prompt.spec.ts (lock-in framing, framing-before-link, ask-once)
 - tests/unit/intake-commitment.spec.ts (unchanged, still green)
 - full unit run: 782 passed, tsc clean
---

## Prompt

new feedback from client [8 iMessage screenshots]. What's still wrong:
The 😎 emoji in the opener is still there. Still flagged, still needs to go.
"yo Karibi 🔥" — fire emoji right after the name. Same issue.
"love it, we lock in on both of these" — love it is still there. This has been
in every single conversation review. Ali needs to kill this phrase permanently.
KIBA asked the same commitment question twice... user already said yes. KIBA
shouldn't be re-asking.
The Stripe link framing is still backwards. The link dropped, then the framing
"7 days free, tap it, get activated" came after. It needs to come before the
link every time. The sequence is: explain the free trial → then send the link.
KIBA sent two back to back messages after the selfie without waiting...

[follow-up] Way better stripe link framing: "7 day free trial" sounds like a
SaaS product... "7 day lock in" fits the language KIBA already uses... The
payment framing should feel like a challenge, not a subscription... "tap this
and we start tonight:" Link. No mention of $20/month. No "free trial." The price
conversation happens naturally on day 7 when KIBA checks in.

## Response snapshot

Mapped the 6 defects to code and fixed each:
- 1/2 (emoji) + 3 ("love it"): added scrubIntakeVoice() in voice.ts (deterministic
  emoji strip + flagged filler-opener strip), applied to every intake reply in
  handleIntakeMessage. Removed the "love it" seed from the prompt + banned it +
  swapped the intake emoji rule to "no emojis in the sign-up flow". Belt-and-
  suspenders: prompt discourages, scrub guarantees.
- 4/6 (double-ask / wall-of-text): intake steps 7-8 now "ask ONCE, then STOP and
  WAIT"; [pause] guidance and PHOTOS rule say one message at the close/after a
  photo, never burst a commitment ask.
- 5 (link framing backwards + SaaS vibe): reframed the close to the "N day lock
  in" CHALLENGE. Added CLOSE_LEAD_IN ("bet. tap this and we start tonight:")
  passed as the leadIn on every intake sendPaymentLink path, so framing ALWAYS
  precedes the URL; the model's trailing reply is suppressed when a link was sent
  this turn (linkJustSent) so nothing lands after the link. Removed price/"free
  trial"/"cancel anytime" from the close; price is quoted only if directly asked,
  and the day-7 reveal is written into the PAYWALL objection copy.

Committed 4373530 to master, pushed (deploy via Render/Vercel). 782 unit pass.

## Outcome

- ✅ Impact: all 6 client-flagged intake/close defects fixed; framing order now
  deterministic (can't regress on prompt drift); emoji/"love it" killed at the
  code layer.
- 🧪 Tests: +13 (scrubIntakeVoice suite, lock-in close-framing assertions); 782
  unit pass; tsc clean.
- 📁 Files: voice.ts, coaching.processor.ts, intake.prompt.ts, 2 specs, checklist.
- 🔁 Next prompts: day-7 price-reveal check-in message (the "$20 lands at day 7"
  KIBA-initiated line) is described in the paywall copy but has no dedicated
  scheduled message yet; confirm whether to build it. Pre-pay nudge prompts
  (winback/ghost/checkin) still carry emoji if Karibi wants those killed too.
- 🧠 Reflection: prompt-only rules had failed for emoji + "love it" across many
  reviews, so the durable fix was deterministic scrubbing at the code layer, with
  the prompt aligned behind it.

## Evaluation notes (flywheel)

- Failure modes observed: prompt rules alone never killed recurrent tics (emoji,
  "love it"); link framing was architecturally backwards because the URL is sent
  mid-turn and reply text after.
- Graders run and results (PASS/FAIL): unit suite PASS (782/782), tsc PASS.
- Prompt variant (if applicable): intake close reframed offer→lock-in challenge.
- Next experiment (smallest change to try): real-conversation walk of the close
  (B9) on a test number to confirm one-message close + framing-before-link.
