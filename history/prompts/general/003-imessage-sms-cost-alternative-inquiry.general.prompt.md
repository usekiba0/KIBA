---
id: 003
title: iMessage as SMS Cost Alternative Inquiry
stage: general
date: 2026-04-28
surface: agent
model: claude-sonnet-4-6
feature: none
branch: master
user: Sumair Roudani
command: inquiry
labels: ["messaging","imessage","twilio","cost-optimisation","architecture","phase-2","apple-messages-for-business","telnyx"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - C:\Users\hp\.claude\plans\now-i-want-to-inherited-peacock.md
tests:
  - none
---

## Prompt

now i want to inquire what if we donot just use twilio for sms and have something implemented that uses imesages to save sms money

## Response snapshot

Researched iMessage programmability and Apple Messages for Business (AMB) as alternatives to Twilio SMS for cost savings. Key findings:

1. **True iMessage automation is impossible** — Apple has no public iMessage API. Mac server + AppleScript hacks violate Apple ToS, are not scalable, and violate RYKE AI constitution Principles VI and XIII.

2. **Apple Messages for Business (AMB)** is the legitimate option but is NOT a Twilio replacement — Apple prohibits proactive outbound messaging, meaning all proactive messages (welcome SMS, daily check-ins, reminders) MUST remain on Twilio/SMS regardless. AMB only handles user-initiated reply threads for iOS users who found you via Apple Maps/Siri/Safari.

3. **Better immediate cost-saving option**: Switch to Telnyx or Bandwidth (~$0.004/msg vs Twilio's $0.0079/msg) — ~50% saving, zero architecture change, works for all users.

4. **Recommended architecture**: Build a provider-agnostic `IMessagingProvider` abstraction in Phase 1 (no behavior change, just clean architecture), add AMB as Phase 2 after Apple approval process (6–12 weeks lead time needed).

5. **Constitution amendment required**: v1.2.0 → v1.3.0 with 6 targeted changes including new Channel-Routing Gate and `channel_type` field on User model.

Implementation order: `/sp.adr channel-agnostic-messaging-layer` → `/sp.adr messaging-cost-optimisation-strategy` → constitution v1.3.0 → `/sp.specify messaging-layer-abstraction` → `/sp.plan` → `/sp.tasks`.

## Outcome

- ✅ Impact: Feasibility assessed; two-track strategy defined (Telnyx for immediate savings, AMB for Phase 2 rich messaging)
- 🧪 Tests: none — planning/inquiry phase
- 📁 Files: Plan written to C:\Users\hp\.claude\plans\now-i-want-to-inherited-peacock.md
- 🔁 Next prompts: /sp.adr channel-agnostic-messaging-layer, /sp.adr messaging-cost-optimisation-strategy, /sp.constitution (v1.3.0 amendment)
- 🧠 Reflection: iMessage cost-saving is a common intuition but technically infeasible as a Twilio drop-in. The real win is provider abstraction + cheaper SMS provider. AMB is valuable for Phase 2 but for UX richness, not cost.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): Run /sp.adr for both architectural decisions to lock in rationale before spec work begins
