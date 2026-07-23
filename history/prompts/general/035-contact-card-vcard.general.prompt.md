---
id: 035
title: Contact card vCard shipped
stage: green
date: 2026-07-22
surface: agent
model: claude-opus-4-8
feature: none
branch: feat/contact-card-vcard
user: usekiba0
command: do it (+ Karibi 2-day summary request); confirmed "got the contact card"
labels: ["apple-masking", "vcard", "onboarding", "launch", "client-update"]
links:
  spec: null
  ticket: null
  adr: null
  pr: https://github.com/usekiba0/KIBA/pull/38
files:
 - backend/src/onboarding/contact-card.ts (new)
 - backend/scripts/gen-contact-card.js (new)
 - backend/src/onboarding/stripe-webhook.controller.ts
 - backend/.env.example
 - backend/tests/unit/contact-card.spec.ts (new)
 - frontend/public/kiba-contact.vcf (new)
 - feedback/2026-07-22-karibi-update-session-B.md (new)
tests:
 - contact-card.spec.ts 5/5; tsc clean; live device test PASSED (card rendered w/ avatar + both numbers on founder's +92 iPhone)
---

## Prompt

do it , also i was runnign two kiba sessions in parallel, this is the summary that other saession provided on what task he has done. please you also update on what task you have done in past 2 days so that i can update karibi on all i have done including all the erroe fixes and feature development and profiles setup

(Then, after the live test-send:) got the contact card

## Response snapshot

Shipped Apple-masking Path B (PR #38 merged): buildVcard() pure builder (vCard 3.0, CRLF, multi-TEL for SendBlue+Twilio, embedded PNG logo) + gen-contact-card.js → frontend/public/kiba-contact.vcf (10KB w/ brand-gradient K avatar) + env-gated CONTACT_CARD_URL auto-send at activation before pin-chat (mirrors PIN_CHAT_MEDIA_URL pattern). Live-verified: test-sent via SendBlue to founder's +92 device, card rendered and saveable. Also wrote the client update doc feedback/2026-07-22-karibi-update-session-B.md covering this stream's 2-day work (PRs #28-31, #33, #35, #36, #38), scoped to not overlap the parallel session's summary.

## Outcome

- ✅ Impact: outbound texts brand as "KIBA" once the user saves the card; iOS unknown-sender filtering defeated; go-live = one Render env var
- 🧪 Tests: 5/5 new, tsc clean, live device PASS
- 📁 Files: 7 (5 new)
- 🔁 Next prompts: user sets CONTACT_CARD_URL + PIN_CHAT_MEDIA_URL on Render; Apple portal logo upload
- 🧠 Reflection: the raw-GitHub media pattern proved out for a third content type (mp4 → mp4 → vcf)

## Evaluation notes (flywheel)

- Failure modes observed: shell-exported Google key shadowing ANTHROPIC_API_KEY (worked around); CWD mismatch on git add
- Graders run and results (PASS/FAIL): live device render = PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): consider sending the vCard to EXISTING active users once, not just new activations
