---
id: 027
title: Dashboard mini apps scoping and link reading
stage: plan
date: 2026-07-21
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: feat/affiliate-referral-codes
user: usekiba0
command: (chat) he wants to build mini app dyamically like tomo
labels: ["scoping","phase-2","dashboard","two-way-sync","schema-audit","web-search","estimate"]
links:
  spec: feedback/new requirement/KIBA_Dashboard_Apps_Proposal.pdf
  ticket: null
  adr: null
  pr: null
files:
 - (none — scoping only, no code written)
tests:
 - (none — no code changed)
---

## Prompt

he wants to build mini app dyamically like tomo

also why cant we do websearch? is it a feature we need to add to make you able to read links like palyright or its not possible at all

## Response

Located the real spec rather than guessing at "mini apps": `feedback/new requirement/KIBA_Dashboard_Apps_Proposal.pdf`. It is a personalized **web** dashboard beside the iMessage thread — execution score trend, to-do checkboxes, workout log, meal log — with instant two-way sync. Not a Telegram/WeChat-style mini-app platform.

Ran a schema audit before quoting. Result reshapes the estimate:

| App | State today | Work |
|---|---|---|
| Execution score | `execution_scores` fully structured, daily upsert, already range-queried | read layer only |
| To-do | `daily_todos` + `todo.service.ts` (`listToday`, `markDone`) already exist | read + toggle |
| Meal log | `nutritional_analyses` table is correctly shaped but **never written**; `VisionService.analyseFood()` has **zero callers** | wire a dead path |
| Workout log | no workout/exercise/set/rep concept anywhere; only freeform prose | new tables + LLM extraction |

Two corrections to the client's framing, both raised explicitly:

1. The proposal calls the build "straightforward… just a webhook." The webhook is ~10% of it. Text→app is a *structured extraction* problem (a log recording 135 lbs when the user said 155 is worse than no log); app→text is a *product judgment* problem (texting on every checkbox is spam and costs a send).
2. **Scope collision:** Phase 2 ($44k, unsigned) already includes "User dashboard / home screen" as native iOS/Android. Web-now is either a pull-forward that comes OUT of the $44k, or the dashboard is paid for twice. Recommended: build the API now, make the native app a client of it.

Reusable asset identified: the "no separate signup/login" requirement is already solved by the HMAC-signed per-user link tokens in `checkout-link.ts`, shipped this week for checkout.

On link reading: possible today at three tiers (Anthropic server-side `web_search`/`web_fetch`; plain fetch + readability; Playwright headless). Flagged the three costs that matter for KIBA specifically — added latency on a product already under a latency complaint, and prompt injection from attacker-controlled page text entering the coaching prompt.

## Outcome

- [x] real spec located; estimate grounded in a schema audit, not a guess
- [x] scope collision with Phase 2 surfaced before any quote went out
- [ ] no code written — Phase 2 work, awaiting explicit go-ahead
- [ ] open: all-four-at-once vs one app end-to-end first

## Follow-ups / risks

- `VisionService.analyseFood()` being dead code is a standalone finding worth fixing regardless of this proposal — nutrition analysis was built and never wired in.
- Monday's 20-user beta is the priority; none of this should start before it.
- Any link-reading feature needs an injection boundary (page text quoted as untrusted data, never as instructions) designed in from the start.
