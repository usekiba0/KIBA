---
id: 016
title: Vision brand recognition + recap "you folded" on un-agreed tasks
stage: general
date: 2026-06-29
surface: agent
model: claude-opus-4-8
feature: none
branch: master
user: usekiba0
command: (chat)
labels: ["vision", "image-recognition", "model-routing", "night-recap", "daily-todos", "bugfix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/ai/coaching.service.ts
 - backend/src/ai/prompts/coaching.prompt.ts
 - backend/src/ai/prompts/intake.prompt.ts
 - backend/src/accountability/recap.service.ts
 - backend/tests/unit/recap.service.spec.ts
tests:
 - backend/tests/unit (794 passed)
---

## Prompt

Client feedback (Karibi), two screenshots from real test convos:

1. Vision — KIBA was sent a photo of a "Salata" restaurant storefront ("Look what I just ate"). It replied "yo that's a restaurant. where's the food pic" and, when asked "U don't know what Salata is?", said "nah i don't. what is it" and refused to "search it up". Karibi: "it doesn't understand stuff like if I send McDonald's picture it won't know what it is, should be able to understand basic stuff like that so it can help ppl."

2. Day recap — Bianca received a "day recap:" with ~10 tasks all ❌, "score: 0/100", and "real talk Bianca. you folded on everything today. no spin. tomorrow we start with 'Buy containers...' first thing." Karibi: "fix why Kiba keeps telling me about goals I didn't discuss and saying I folded at the end of day."

## Response snapshot

Root-caused both (read-only investigation via two Explore agents), confirmed scope with Karibi via AskUserQuestion, then shipped.

ISSUE 1 — vision works, model is the limit. The image pipeline correctly passes photos to Claude (KIBA *did* see the storefront — "that's a restaurant", "where's the food pic" = no food in frame). The real gap: coaching/intake replies default to **Haiku 4.5** (`coaching.service.ts`), whose OCR + brand/world-knowledge is too weak to read the "Salata" sign or recall the chain. Prompt also had a "play dumb" tension ("nah who's that?"). Karibi chose: **stronger model on photos + prompt.**
- `coaching.service.runChat`: route image-bearing turns to `AI_VISION_MODEL` (default `claude-sonnet-4-6`); text-only turns stay on the cheaper base model, so cost only rises on photo turns.
- coaching.prompt + intake.prompt: instruct KIBA to READ text/signs/logos/storefronts and NAME the place/brand from its own knowledge; stop playing dumb / "search it up" on common brands. Tightened wording to stay under the 26.5k system-prompt budget guard.

ISSUE 2 — recap shamed un-agreed tasks. On signup an action plan is auto-generated and `ensureSeededForToday()` silently seeds ~10 PLAN tasks (status OPEN, never agreed to). `recap.service` counted **every OPEN todo as "missed" regardless of source**, the score showed 0/100, and `recap.prompt` fired "you folded on everything". Karibi chose: **only score/shame engaged tasks.**
- `recap.service.buildAndSend`: `missed` now excludes OPEN PLAN todos (untouched auto-seeds) — only USER/AI-added OPEN todos count as missed; DONE counts for any source. A day of only untouched plan tasks → done=0/missed=0 → recap returns null (stays silent), so no false "you folded", no 0/100. Added 2 spec cases (Bianca silent-case + USER task still shamed).

Note: the recap `score` line comes from the separate `DailyTask` engine (one headline task/day, used by strikes/tone). Left untouched — on a genuinely engaged day the score is legitimate, and the null-on-no-engagement path covers the reported screenshot.

## Outcome

- ✅ Impact: Photo turns recognize basic brands/places; recap no longer shames users for auto-seeded goals they never discussed.
- 🧪 Tests: 794/794 unit pass; tsc clean. New recap cases assert silent-on-untouched-plan + still-shame-USER-tasks.
- 📁 Files: coaching.service.ts (vision model routing), coaching.prompt.ts + intake.prompt.ts (read signs/name brands, no play-dumb), recap.service.ts (engaged-only missed), recap.service.spec.ts (+2 cases).
- 🔁 Next prompts: confirm `AI_VISION_MODEL` env in prod; consider DailyTask score also excluding un-agreed auto-tasks (deferred, broader subsystem).
- 🧠 Reflection: "broken vision" was actually a weak-model + prompt issue; "fabricated goals" was a source-blind recap. Both fixed without touching the riskier scoring engine.

## Evaluation notes (flywheel)

- Failure modes observed: Haiku OCR/brand recall too weak for storefront signs; recap ignored DailyTodo.source so PLAN auto-seeds were shamed.
- Graders run and results (PASS/FAIL): unit suite PASS (794/794), tsc PASS.
- Prompt variant (if applicable): coaching vision lines tightened for 26.5k budget.
- Next experiment (smallest change to try): sim/real-convo check that a McDonald's/Salata photo now gets named on the Sonnet vision path.
