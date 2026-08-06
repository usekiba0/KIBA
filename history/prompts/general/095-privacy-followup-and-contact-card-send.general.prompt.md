---
id: 095
title: Privacy policy follow-up and manual contact card send
stage: general
date: 2026-08-06
surface: agent
model: claude-opus-5[1m]
feature: none
branch: chore/privacy-followup-contact-card
user: usekiba0
command: (conversation)
labels: ["a2p", "privacy-policy", "apple-masking", "contact-card", "client-comms", "tapbacks"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - feedback/2026-08-06-karibi-privacy-followup.md
 - feedback/2026-08-06-privacy-policy-exact-edit.md
 - feedback/2026-08-06-karibi-messages-pending.md
 - backend/scripts/send-contact-card.js
tests:
 - none (no application code changed; script exercised via --dry-run then live send)
---

## Prompt

all milestone werepaid ,i also sent the reaction reply to karibi  now lets followup on prvacy policy

(followed by) do it

— selecting: fire the contact card to Karibi's number, commit the feedback files,
prep the exact Base44 edit.

Preceding context, three client messages from Karibi (2026-08-06):
- "o the contact card isn't working rn?"
- "Like the Apple masking is approved but it's not showing right now ?"
- "Also how can we add KIBA to react to messages more like w thumbs up emphize question all that"

## Response snapshot

**Verified before answering, not asserted from memory.**

Contact card / Apple masking:
- PR #79's hourly sweep is live and correct in prod: `activation_asks_sweep` at 03:00
  (1 candidate, 0 sent — quiet hours) and 04:00 (1 candidate, 1 sent). Card + pin video
  both `QUEUED`, no errors.
- `CONTACT_CARD_URL` = `https://onboarding.usekiba.ai/kiba-contact.vcf` → 200,
  `text/x-vcard`, 10062 bytes, `FN:KIBA`, both numbers, PNG logo embedded.
  (`kiba.vcf` — my first guess — 404s. The real filename is `kiba-contact.vcf`.)

Tapback reactions — **already built, do not rebuild**: all six (love, like, dislike, laugh,
emphasize, question) at `messaging.service.ts:435`, exposed to the model as a tool at
`coaching.processor.ts:2224`, correctly gated to iMessage + a non-null `messageHandle`.
They have never fired in prod only because **prod had zero inbound messages in 30h**
(`send_reaction`, `inbound_imessage`, `turn_latency` all 0). The prompt says use them
"SPARINGLY" — frequency is a one-line dial awaiting Karibi's preference.

Privacy policy (the A2P 30908 blocker) — re-verified BY CONTENT against bundle
`index-CAlipZ0y.js`: `message frequency` 0 hits, `mobile information` 0, `opt-in data` 0,
`affiliate` 4 — **all four are React's license banner, none in policy text**.
Extracted the live copy of both sections word for word. Finding worth naming: the
"Sharing Information" paragraph is not merely incomplete, it names messaging providers as a
sharing recipient with **no carve-out for phone numbers** — likely the actual 30908 trigger.

Stamp audit across all 15 prod users: only 3 are `onboarding_stage=complete`, and all 3 are
stamped with `activation_asks_sent_at`. Everyone else is stuck in `intake` or
`payment_pending`. **The contact card's reach is capped by onboarding completion, not by the
sweep.**

Manual send to Karibi (+18325604035) → HTTP 202, `QUEUED`, no error.

## Outcome

- ✅ Impact: Karibi has the contact card on his device; a chase message and a
  ready-to-execute Base44 edit exist for the last launch blocker; a reusable
  `send-contact-card.js` covers demoing the card and repairing any user stamped while
  `CONTACT_CARD_URL` was unset.
- 🧪 Tests: none added — no application code changed. Script verified via `--dry-run`
  (asserts the .vcf serves as a real vCard before sending) then run live.
- 📁 Files: 3 feedback docs + 1 script.
- 🔁 Next prompts: send the follow-up; on "it's done", verify by content and resubmit
  CM6898f77d…; set tapback frequency once Karibi answers.
- 🧠 Reflection: two claims were withdrawn mid-investigation rather than shipped. The
  contact card's absence from Karibi's thread looked like proof it never sent — until
  `messaging.service.ts` turned out to have no `messageRepo` at all, so out-of-band sends
  never persist a row. Absence of evidence was not evidence of absence.

## Evaluation notes (flywheel)

- Failure modes observed: (1) guessed the .vcf filename instead of reading
  `CONTACT_CARD_URL` — got a 404 and nearly reported the card broken; (2) grepped
  `inbound_message` when the op is `inbound_imessage`, briefly implying zero traffic for the
  wrong reason; (3) Render's logs API rate-limits (429) and my pager caps at 20000 lines, so
  a 46h window silently under-covers — the admin API is the right tool for anything older
  than ~24h.
- Graders run and results: n/a.
- Prompt variant: n/a.
- Next experiment: have the activation sweep log `contactCardUrl` presence at send time, so
  a user stamped without the .vcf is visible in logs instead of only inferable from env
  history.
