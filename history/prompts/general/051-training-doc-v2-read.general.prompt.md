---
id: 051
title: Read KIBA Training Doc v2
stage: general
date: 2026-07-29
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (freeform request)
labels: ["training-doc", "phase-2", "prelaunch", "p0", "retraining"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - (read-only) phase 2/new plaanning/KIBA_Training_Doc_v2.pdf
tests:
 - none
---

## Prompt

read the file KIBA_Training_Doc_v2 in  folder phase 2 new planing its the mock convo and trainiing update

## Response snapshot

Located and extracted `D:\kibi\phase 2\new plaanning\KIBA_Training_Doc_v2.pdf` (15 pages, pypdf text extraction) and summarised it.

Doc is Karibi + Claude's pre-launch spec for Ali, built on 2 rebuild tests (82 graded messages) plus unresolved Doc v1 items.

**Core diagnosis:** the Phase 1 retraining landed on the LIVE conversational surface but not on TRIGGERED message classes (payment webhook, scheduled recap, ghost templates) or TRANSITION MOMENTS (name reaction, city reaction, config confirm, close pitch). Those render without consuming conversation state.

**P0 launch blockers (before Friday):**
1. P0.1 Post-purchase hallucination — fake streak congratulation ~30s after payment (T1 msg 42). Fix = split FIRST-EVER-PAYMENT vs RENEWAL templates; no scheduled message claims history without ledger verification.
2. P0.2 Fake proof accepted — "done" accepted for an outreach commitment (T2 msg 40). Fix = per-category proof spec (fitness / business / study / vice / money / content); words alone never count.
3. P0.3 First-person hallucination — KIBA spoke as the user ("yeah i'm doing that") and answered its own city question with "houston" after user declined (T2 msgs 26, 32). Fix = role-boundary rule + clarify-don't-execute + timezone fallback.
4. P0.4 Wrong challenge window — "3 days" spoken while Stripe runs a 7-day trial. Fix = hard-code 7 days, grep/replace templates.
   Plus: payment webhook must send ONE message (T1 stacked 3); pin ask moves to after first check-in.

**P1 (8 items):** closing amnesia (no disclosure callback at close, 100% consistent), identity referendum surviving inside close templates (4 instances), dead name-reaction template, cultural mirror missing non-hub cities ("macon georgia"), menu-retreat under disruption (missed a coded confession after a 16h ghost), soft-repeat after apology, emotional-bid first-pass misses (last clause weighted over highest-emotion clause), re-asking already-settled config.

**Doc v1 leftovers:** deliverable engine doesn't fire for behavioural goals; payment message stacking; pin timing; interest file not routing into recommendation generation; no cross-session memory boundary rules.

**New systems (post-launch, ordered):** ghost recovery ladder (5 stages, distinct psych levers, cancel-on-reply), vice-category module, persistent memory / interest+skill+people files, emoji router, register/style mirror, post-purchase deliverable consistency, weekly review rebuilt on verified ledger only.

Also contains 26 locked principles (14 carried from v1 + 12 new), a pre-launch checklist, a 5-onboarding test methodology, and post-launch monitoring rules (read first 50 transcripts; disable auto-payment messages if any hallucinated streak ships).

Flagged overlap with already-shipped work so we don't rebuild: P0.1's class relates to PR #48 day-zero praise (which targeted the Stripe trial_will_end event, not the first-payment congratulation template); P0.2 overlaps PR #35 verified-miss plus the known proof-verification-on-Haiku gap; the ledger-verification principle is the same guard pattern as correctTimeClaims / correctEventTimingClaims / the weight-progress fix, just not applied to payment-triggered templates.

Offered next step: audit the codebase against the P0 list to confirm which four are genuinely still broken before starting fixes.

## Outcome

- ✅ Impact: Training Doc v2 read and converted into an actionable P0/P1 register with known-overlap flags against shipped PRs.
- 🧪 Tests: none (read-only session)
- 📁 Files: no repo files modified; PDF text cached to session scratchpad only
- 🔁 Next prompts: audit code against P0.1–P0.4 + payment stacking + pin timing; then fix in priority order before Friday soft launch
- 🧠 Reflection: the doc's own framing ("any message class that renders without reading conversation state gets rewritten to inject state before render") is the single unifying fix and should drive the implementation plan rather than treating the items as 12 separate bugs.

## Evaluation notes (flywheel)

- Failure modes observed: PDF page-render tooling unavailable (poppler missing); pypdf text extraction used instead and was sufficient.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): grep templates for "3 days"/"5 days"/"5 months"/"30 days" — the cheapest P0 (P0.4) to close and a fast signal on how many template files bypass state injection.
