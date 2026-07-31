---
id: 050
title: Pre-Launch Action Items — answers and quotes
stage: general
date: 2026-07-29
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (chat)
labels: ["client-comms", "pricing", "latency", "vision", "web-search", "plaid", "mini-apps", "a2p"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - phase 2/new plaanning/make_prelaunch_answers_doc.py
 - phase 2/new plaanning/KIBA_PreLaunch_Answers_2026-07-29.docx
 - phase 2/new plaanning/KIBA_PreLaunch_Answers_2026-07-29.pdf
tests:
 - none (documentation deliverable, no code changed)
---

## Prompt

pleasecheck this file under phase 2 -? new planning folder KIBA Pre Launch Action Items

Also these are a couple things I wanted to address/ get an update on. Can u pls send me a doc addressing or answering everything soon.

Including updates on all the other inquires above so we can be on same page and I can get a visual of everything

## Response snapshot

Read `phase 2/new plaanning/KIBA Pre Launch Action Items.pdf` (Karibi, 5 items:
instant response, Plaid bank connection, mini apps, vision/domain accuracy, live
info + refusal pattern). Verified each item against the codebase rather than
answering from memory, then produced a client-facing response doc.

Codebase findings that drove the answers:

- **Item 1 (latency).** `TEXT_DEBOUNCE_MS = 0` (message-debouncer.service.ts:43) —
  no artificial wait. `MESSAGE_BUBBLE_DELAY_MS` default 700 (coaching.processor.ts:2137).
  Image debounce 3000ms is deliberate. The "acknowledge fast, then answer" rule
  Karibi asked for **already shipped** as `onInterimText` in coaching.service.ts:1196-1209
  (PR #49). Measured: generation time tracks reply length.
- **Item 4 (vision).** Conversational photo turns route to `AI_VISION_MODEL`
  (default `claude-sonnet-4-6`, coaching.service.ts:1063) — already upgraded 29 June.
  **Gap found:** `vision.service.ts` `validateProof`/`validateProofFromUrl` runs on
  `AI_MODEL` (Haiku 4.5), i.e. proof-photo judgement uses the weakest vision model.
  `analyseFood`/`analyseFoodFromBytes` have no callers — nutrition numbers today are
  pure model estimate, no database.
- **Item 5 (live info).** No web-search integration exists anywhere in `backend/src`.
  coaching.prompt.ts:701 explicitly tells KIBA it cannot pull live info; :696 already
  says "answer ANY question fully" and :699 bans deflections — so the DDG refusal is
  emergent accountability behaviour, not an instructed refusal. Fix = a curiosity-vs-
  avoidance rule, plus Anthropic's built-in `web_search` tool ($10/1k searches, not
  available on Haiku → needs the same model-routing pattern already used for photos).
- **Item 3 (mini apps).** This *is* Stage 2.0 in `make_scope_v2_doc.py` ($10,000,
  split $4,500/$5,500). Both enabling pieces already exist: tokenised no-login link
  (payment page, 21 July) and branded OG link previews (PR #47).
- **Item 2 (Plaid).** Genuinely new scope — **not** Stage 2.4 Money Mode ($8,000 =
  card-on-file + charge-on-failure + charity payout). Proposed as Stage 2.6.

External research: Anthropic web search $10/1,000 searches; model pricing (Opus 5
$5/$25, Sonnet 5 $3/$15 with $2/$10 intro through 31 Aug, Haiku 4.5 $1/$5); Sonnet 5
is the first Sonnet-tier model with high-res vision (2576px vs 1568px) at the same
list price as 4.6 — a strict upgrade; Plaid does not publish Transactions per-item
pricing (~$1.50/item/month benchmark); USDA FoodData Central free/CC0; Nutritionix
commercial from ~$1,850/mo.

Two honest pushbacks written into the doc: (1) a read-only Plaid connection cannot
*prevent* a purchase and "within a minute" is not achievable — real-time interception
needs card issuing; (2) Apple does not permit third-party mini apps inside iMessage
without a native app, so Tomo's are web views behind branded links.

Also confirmed from TWILIO_A2P_SETUP.md: **Brand APPROVED 2026-07-28**. Campaign is
now the last launch gate and is blocked solely on Karibi's consent-screen screenshot.

Deliverable generated as .docx (python-docx, house style) and converted to .pdf via
Word COM.

### Revision (same session)

User: *"the doc is misleading and confusing, make phase 2 separate from the work summary
and pricing consolidated in one place."* Fair — v1 put a price block inside each of the
five items **and** repeated them in a summary table, which reads as double-counting, and
it interleaved Phase 2 scope with Phase 1 launch status.

Restructured to four parts with a strict rule: **Parts 1–3 contain no prices at all.**

- **Part 1** — only the three items that touch the current build (instant response, vision
  accuracy, live info/refusals). Items 4 and 5 reduced to a two-line pointer.
- **Part 2** — launch gates, shipped-since-the-21st, six open decisions.
- **Part 3** — Phase 2 on its own pages: mini apps = Stage 2.0 (already quoted), bank
  connection = new Stage 2.6.
- **Part 4** — all money, five buckets: A included $0 · B post-launch add-ons $3,800 ·
  C existing Phase 2 $52,500 · D new Stage 2.6 with a **running total** ($62,000 v1 /
  $66,500 v1+v2) · E mini-app pull-forward $3,750 stated in bold as a *credit against*
  Stage 2.0, not an addition.

The running total and the never-charged-twice line are the two specific fixes for
"misleading" — v1 left the client to do both sums himself. Doc opens with a four-row map
of its own structure. Final: 10 pages, .docx + .pdf.

## Outcome

- ✅ Impact: All five items answered with a verified status or a priced quote, plus a full status picture (launch gates, shipped-since-21st, open decisions) and a one-page price/timeline summary.
- 🧪 Tests: None — documentation only, no source changed.
- 📁 Files: doc generator script + .docx + .pdf under `phase 2/new plaanning/`.
- 🔁 Next prompts: ship the free-tier work before Friday (reply-length tightening, `AI_VISION_MODEL` → Sonnet 5, proof verification off Haiku, ask-instead-of-inventing rule, curiosity-question rule); then live web search and the USDA nutrition tool.
- 🧠 Reflection: Checking the code first changed three of the five answers materially — item 1 was largely already shipped, item 3 was already quoted, and item 4 surfaced a real gap (proof verification on Haiku) that the client had not asked about.

## Evaluation notes (flywheel)

- Failure modes observed: The client's framing assumed problems that were already fixed (instant response) or already quoted (mini apps); answering from the doc alone would have produced a wrong and expensive reply.
- Graders run and results (PASS/FAIL): N/A
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): Flip `AI_VISION_MODEL` to `claude-sonnet-5` in Render and compare food-photo identification on a small sample before quoting the nutrition-DB work.
