---
id: 053
title: Vision accuracy — proof off Haiku, 5-series-safe requests
stage: general
date: 2026-07-29
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (chat)
labels: ["vision", "accuracy", "model-routing", "proof-verification", "prompt", "pre-launch"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/ai/model-params.ts (new)
 - backend/src/ai/vision.service.ts
 - backend/src/ai/coaching.service.ts
 - backend/src/app.module.ts
 - backend/src/ai/prompts/coaching.prompt.ts
 - backend/.env.example
 - backend/scripts/sim-vision.ts (new)
 - backend/tests/unit/model-params.spec.ts (new)
 - backend/tests/unit/vision.service.spec.ts
 - backend/tests/unit/coaching.prompt.spec.ts (budget attribution comment only)
tests:
 - tests/unit/model-params.spec.ts — 12 new
 - tests/unit/vision.service.spec.ts — 4 new (model selection + 5-series request shape)
 - full unit suite: 95 suites / 1298 tests passing
---

## Prompt

can  we work on vison and do,ai aaccuracy now

(then, after the working tree turned out to hold another session's in-flight edits)

wait for othr task to complete then continiw

## Response snapshot

Item 4 of Karibi's pre-launch list. Three fixes were promised in
`KIBA_PreLaunch_Answers_2026-07-29.docx`: upgrade the vision model, move proof
verification off Haiku, and add an ask-instead-of-inventing rule.

**The bug (shipped).** `vision.service.ts` read `AI_MODEL` in all three of its
methods, so proof-photo verification — deciding whether a user's evidence counts
— ran on Haiku 4.5, the weakest vision model in the stack. Conversation photos
were moved to `AI_VISION_MODEL` on 2026-06-29 after the Salata storefront miss;
proof verification was missed at the time. All three now use a single
`visionModel()` accessor. `analyseFood`/`analyseFoodFromBytes` are currently
**dead code** (no callers anywhere) — left in place and flagged rather than
deleted, since item 4c (USDA nutrition lookup) is the natural caller.

**The finding that changed the plan.** The doc told Karibi the Sonnet 5 upgrade
was "a config change". It was not — flipping `AI_VISION_MODEL` alone would have
broken two things, both silently:

1. `vision.service` sent `temperature: 0` on every call. A non-default
   temperature is a **400** on the 5-series.
2. Omitting `thinking` used to mean "no thinking"; on the 5-series it means
   adaptive thinking. `max_tokens` caps thinking + answer together, so the
   128-token proof verdict would have spent its budget thinking and returned
   truncated JSON. `validateProofFromUrl` **fails open** by design, so every
   proof would have been silently accepted with no error surfaced anywhere.

New `src/ai/model-params.ts` resolves both by model id: `deterministicParams()`
for structured-JSON calls, `noThinking()` for conversational ones. Both are
**no-ops on the 4-series**, so today's requests are byte-identical and the env
var becomes genuinely safe to flip. The regex deliberately does not match
`claude-haiku-4-5-20251001` — a naive `/-5/` test hits both its version and its
date suffix, which would have sent 5-series params to every text turn.

**Deliberately NOT done:** the default stays `claude-sonnet-4-6`. Two days
before launch, the upgrade is staged rather than pulled — `scripts/sim-vision.ts`
runs the real proof call and the real photo read against two models side by side
(answers, latency, per-photo cost) so the flip is made on evidence.

**Prompt.** Added a "NOT SURE? ASK — never invent" block: name what you can see
and ask for what you can't, identify the dish before pricing it, calories as a
range not a fake-precise number, never state a guessed number/date/price/spec as
fact. Written at ~1.9k chars, compressed to 648 before landing.

### Concurrent-session collision

Mid-task the working tree turned out to contain another session's uncommitted
Training Doc v2 work (`proof.service.ts`, `intake.prompt.ts`, `user.entity.ts`,
`stripe-webhook.controller.ts`, and the same `coaching.prompt.ts`). Two suites
were red for reasons that were **not** this change:

- `proof.service.spec.ts` (11 failures) — `ProofService` gained a `ConfigService`
  constructor arg without the spec's test module providing it.
- `coaching.prompt.spec.ts` size budget — the file had grown 5,153 uncommitted
  chars, of which only 648 were mine.

Rather than patch someone else's in-flight work or raise a shared guardrail on
their behalf, the run was paused behind a quiescence monitor until those edits
settled. The other session then fixed its spec and raised the budget to 36,400,
justified entirely by its own batch. Added an attribution comment recording the
648 chars that landed in the same window, and a warning that only ~120 chars of
headroom remain.

## Outcome

- ✅ Impact: Proof verification no longer runs on the weakest vision model; a Sonnet 5 flip is now a safe env-var change instead of two silent failure modes; KIBA asks instead of inventing specifics.
- 🧪 Tests: 16 new; full unit suite 95 suites / 1298 tests green. `tsc` clean, lint clean on changed files (repo-wide CRLF prettier noise on Windows is pre-existing).
- 📁 Files: 2 new source files, 1 new script, 1 new spec, 6 modified.
- 🔁 Next prompts: run `sim-vision.ts` on real food/proof photos, then flip `AI_VISION_MODEL=claude-sonnet-5` in Render if it wins. Then item 4c (USDA nutrition lookup, $2,200) and item 5b (live web search, $1,600).
- 🧠 Reflection: The promised "config change" was only a config change *after* the request shape was made generation-aware. Verifying the claim before repeating it caught a failure mode that would have accepted every proof photo silently.

## Evaluation notes (flywheel)

- Failure modes observed: (1) A model-version upgrade presented as an env-var flip, when two request-shape assumptions would have broken quietly. (2) A shared repo with another agent session editing the same files — a red suite that had nothing to do with this change.
- Graders run and results (PASS/FAIL): PASS — full unit suite green after the collision resolved.
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): `npx ts-node -r tsconfig-paths/register scripts/sim-vision.ts <meal photo> "eat a high-protein lunch"` and compare sonnet-4-6 vs sonnet-5 on identification, signage reading, and admitted uncertainty.
