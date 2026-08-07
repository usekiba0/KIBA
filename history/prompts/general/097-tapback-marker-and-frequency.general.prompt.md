---
id: 097
title: Tapback marker and frequency rules
stage: general
date: 2026-08-07
surface: agent
model: claude-opus-5[1m]
feature: none
branch: chore/privacy-followup-contact-card
user: usekiba0
command: "build 1 and 3"
labels: ["tapbacks","reactions","imessage","latency","prompt","client-feedback"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/messaging/outbound-reaction.ts (new)
 - backend/src/messaging/coaching.processor.ts
 - backend/src/ai/coaching.service.ts
 - backend/src/ai/prompts/coaching.prompt.ts
 - backend/tests/unit/outbound-reaction.spec.ts (new)
 - backend/tests/unit/outbound-reaction-dispatch.spec.ts (new)
 - backend/tests/unit/coaching.prompt.spec.ts
 - backend/scripts/sim-reactions.ts (new)
tests:
 - tests/unit (112 suites / 1652 tests) — PASS
 - scripts/sim-reactions.ts against live claude-haiku-4-5 — PASS
---

## Prompt

build 1 and 3

(From the prior turn's three options: (1) inline `[react:…]` marker instead of a
tool call, removing the latency cost; (3) rewrite the frequency guidance to
Karibi's spec. Option (2) — extending reactions to intake — was left out pending
Karibi's answer on the intake no-emoji rule.)

## Response snapshot

**1 — tapback as an inline marker, not a tool call.**

New `backend/src/messaging/outbound-reaction.ts`: `extractReaction()` pulls a
`[react:love|like|dislike|laugh|emphasize|question]` marker out of a reply and
returns the marker-free text. First valid marker wins (one tapback per reply);
invalid/invented markers are stripped and send nothing; `[pause]` is preserved.

`coaching.processor.ts`:
- `ReactionTarget { channel, messageHandle, fired }` built once per turn.
- `saveAndSend()` extracts the marker FIRST — before `humanizeVoice`,
  `splitBubbles` and persistence — so it can never reach a bubble, the stored
  row, or next-turn model context. Applies on every path including intake.
- `dispatchReaction()` fires the tapback WITHOUT awaiting, so its provider
  round-trip overlaps the first bubble instead of delaying it; awaited at the end
  of the turn so failures still log (`operation: 'outbound_reaction'`).
- iMessage + a message_handle only; SMS strips the marker and attempts nothing.
- `fired` is per-TURN, so the text path's two sends (early bubble, then final
  reply) can't produce two tapbacks.

Deleted: `REACT_TO_MESSAGE_TOOL`, its dispatch branch, `reactToMessage` from
`CoachingToolHandlers`, and the handler in `buildToolHandlers` (whose now-unused
`channel`/`messageHandle` params went with it).

**3 — frequency rules.** A REACTIONS block in `COACHING_STATIC_RULES`: react
first then talk, the six names mapped to situations, *"react on MOST turns where
they did something, sent something, or told you something real"*, *"the marker
NEVER replaces your words"*, skip on pure logistics. The old *"Use SPARINGLY /
do NOT react to every message"* language is gone with the tool.

Prompt budget raised 36400→37200 (+752). Near-free per turn: the deleted tool
description + schema was ~800 chars sent on every coaching turn alongside the
prompt.

**Verification — `scripts/sim-reactions.ts` against live Haiku (prod's model):**

| turn | reaction | reply |
|---|---|---|
| "just got back from the gym" | `like` | "let's go. what'd you hit?" |
| "hit 225 for 5 first time ever" | `love` | "WAIT. that's a squat PR…" |
| "sent you a pic of someone elses food lmaooo" | `laugh` | "wait WHAT. whose food even is that?" |
| "nah i didnt do it, been on my phone" | `dislike` | "that's the second time this week…" |
| "my dad got his results back. not good" | — | "hey. what happened with his results." |
| "what time was the check in" | — | (bare) |
| "ok" | — | (bare) |

4/5 substantive turns reacted, 0/2 logistics. Zero invented markers, zero
marker-only replies, marker always at the start. The heartfelt turn correctly
declined to react.

## Outcome

- ✅ Impact: Karibi's two literal examples now work, at zero latency cost — reacting no longer forces a second model round-trip, which was the whole objection to doing it more often.
- 🧪 Tests: full unit suite green (112 suites, 1652 tests); 19 new tests across parser and dispatch; live-model sim passes.
- 📁 Files: 4 new, 4 modified.
- 🔁 Next prompts: option (2) — reactions during intake — needs Karibi's call on whether a tapback counts under the "NO emojis in the sign-up flow" rule. Then PR + deploy, and re-run the prod tapback audit once real coaching traffic exists.
- 🧠 Reflection: the tool-vs-marker swap turned a product tradeoff into a non-issue. Worth reaching for whenever a "do X more often" ask is being throttled by X's cost rather than by X being wrong.

## Evaluation notes (flywheel)

- Failure modes observed: none in the sim. The pre-existing risk — prod runs Haiku, where prompt-only guards historically don't hold — was checked directly rather than assumed, and held here because the marker is a concrete emission, not a behavioural restraint.
- Graders run and results (PASS/FAIL): sim-reactions PASS (4/5 substantive, 0/2 logistics, 0 invented).
- Prompt variant (if applicable): REACTIONS block, ~752 chars.
- Next experiment (smallest change to try): if the live rate reads low once real coaching traffic returns, move the block above TONE rather than lengthening it.
