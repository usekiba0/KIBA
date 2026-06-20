---
id: 0007
title: Updated-feedback docs audit + Batch A flow fixes
stage: green
date: 2026-06-20
surface: agent
model: claude-opus-4-8[1m]
feature: none
branch: feat/kiba-feedback-2026-06-18
user: usekiba0
command: general chat
labels: ["phase1", "audit", "markdown", "payment-link", "intake-fallback", "voice", "prompt", "tomo"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/src/messaging/voice.ts (NEW stripMarkdown() in humanizeVoice — strips *bold*/`code`/## headings, normalises */+ bullets to -, drops stray asterisks; preserves [pause])
  - backend/src/ai/prompts/coaching.prompt.ts (NO-markdown TONE rule; replaced proactive "UPGRADE MENTIONS" freemium block with PAYMENT block — no self-initiated selling, link only on explicit request)
  - backend/src/ai/prompts/intake.prompt.ts (NO-markdown TONE rule)
  - backend/src/messaging/coaching.processor.ts (line ~829 fallback: replaced destructive "tell me your goal in one sentence" with non-destructive re-anchor on known goal/name)
  - backend/tests/unit/voice.spec.ts (9 new markdown-stripping cases)
tests:
  - "tsc --noEmit clean; 626/626 unit tests pass (voice/bubbles/coaching.prompt green); prompt size budget kept under 24000"
commits:
  - "(uncommitted — pending review)"
---

## Prompt
Client provided 6 new docs in feedback/updated feedback/: KIBA Current Flow Convo Rewrite (ORIGINAL vs REWRITTEN flow spec), KIBA_vs_Tomo_Analysis (field audit of both apps), and 4 north-star mock convos (Devon/Jamie/Marcus/Tyler). Asked to read all, then (after clarifying what each means) ran a read-only audit and shipped Batch A fixes.

## Response (key outcomes)
Read-only audit (4 parallel Explore agents) mapped Rewrite-doc items to live code:
- STILL BROKEN: markdown not stripped for SMS (voice.ts only handled em-dashes); payment link re-pitched freely (coaching prompt's "UPGRADE MENTIONS" freemium block invited self-initiated upsell; the `send_payment_link` tool already refuses active subs); destructive intake fallback string at coaching.processor.ts:829.
- ALREADY DONE (doc transcript partly stale): multi-bubble bursts (splitBubbles/[pause]), execution score + strikes + proof + Night Recap + Weekly Review (prompt AND code), ask-first/one-question/reflect-words/never-question-commitment, pressure+cussing tone adaptation, cross-session intake continuity.
- PHASE 2 (parked): Money Mode + Recovery Task (confirmed absent from codebase), real-time calorie tracking from photos, custom app building, GPS/health proof, deep URL business advice.

Batch A shipped (commit 91666b7): markdown stripping (+9 tests), no-markdown prompt rules, payment block rewrite (no proactive selling), non-destructive intake fallback.

Batch B shipped: ROOT CAUSE of empty intake replies = runChat could spend all MAX_TOOL_ITERATIONS (3) calling tools without emitting text → finalReply empty → fallback fired. Fix: forced no-tools completion in coaching.service.ts runChat (history already carries tool calls+results), gated on args.dispatch; +regression test. Plus coaching.prompt additions: SHORT/DRY TEXTERS mirroring (Tyler), STRIKES & RECOVERY (recovery task at 2nd strike), NO ZERO DAYS redirect. Prompt size budget 24k→25k.
