---
id: 056
title: A2P campaign form compliance fixes
stage: general
date: 2026-07-29
surface: agent
model: claude-opus-5[1m]
feature: none
branch: fix/training-doc-v2-prelaunch
user: usekiba0
command: (freeform request)
labels: ["a2p", "10dlc", "compliance", "consent", "opt-in", "prelaunch"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/components/OnboardingForm/Step4Contact.tsx
 - frontend/src/app/onboarding/page.tsx
 - backend/src/data/legal-content.ts
 - backend/src/messaging/opt-out.ts
 - backend/tests/unit/opt-out.spec.ts
tests:
 - backend — 96 suites / 1321 tests pass
 - backend + frontend tsc clean
---

## Prompt

(A2P campaign form — Recipient consent / Message flow page, then the Opt-in
keywords page, then the submitted Campaign Details screen. User asked for the
form fields to be filled, then: "go ahead and commit those three but first
respond to this".)

## Response snapshot

Filled the campaign form field by field, and in doing so found three things the form asks for by name that we did not have. Each was a live rejection risk, so each was fixed rather than worked around.

**1. No consent checkbox.** `Step4Contact.tsx` relied on "By tapping Continue you agree…". The campaign form lists "Checkbox for consent (must NOT be pre-selected)" as a web-form requirement and repeats it under Important notes. Now a real checkbox, `useState(false)`, with Continue disabled until ticked, plus flex-row styling since the reviewer screenshots this exact view.

**2. Privacy policy missing 2 of its 3 mandated statements.** Twilio requires the PRIVACY POLICY ITSELF to carry non-sharing for mobile numbers, message frequency, and "message and data rates may apply". Verified against the live page: only non-sharing was present — frequency and rates were on the SMS Terms page, a different document that does not satisfy the check. Added a Text messages section to `legal-content.ts` with all three plus the stronger carrier-preferred wording ("No mobile information is shared with third parties or affiliates for marketing purposes"). Content is served from the API with `revalidate = 300`, so this needs a backend deploy to go live.

**3. Opt-in confirmation missing HELP.** The form wants brand name + enrollment confirmation + help instructions + opt-out instructions. `OPT_IN_CONFIRMATION` had three of four. Rather than registering a message we don't send, changed the copy to "You're back in. KIBA will pick up where you left off. Msg&data rates may apply. Reply HELP for help, STOP to unsubscribe." — still one 160-char segment. New test pins all four elements.

Also corrected the keyword answer: the user had entered Twilio's default `START, YES, UNSTOP`, but `OPT_IN` in `opt-out.ts` accepts six — `START, YES, UNSTOP, RESUME, OPTIN, OPT IN`. Registered the full set so the campaign matches what the system honours.

**Campaign submitted:** `CM6898f77d4ec5634c9a027ccf3ba1817d`, MIXED, under approved Brand `BN01f55ab5…`, Messaging Service `MG93f4ba4ad410486c5a4545b2115f1176`. In review.

Two observations raised on the Campaign Details screen:
- "Assigned phone numbers" appears empty — +1 832 735 5182 must be added to the Messaging Service sender pool or nothing sends after approval.
- Twilio's default opt-out handling covers SMS only, with Twilio's own copy. iMessage via SendBlue is never seen by Twilio, so `opt-out.ts` remains the sole authority there — which is why it exists. Enabling Advanced Opt-Out would align both channels with the registered copy, BUT flagged an unverified risk: if Twilio absorbs STOP without forwarding to `/v1/webhooks/sms`, our DB never records `opted_out_at`, the user still looks active in admin, and queued check-ins bounce as 30007. Recommended leaving it off during review and testing STOP from a real Android handset after approval.

Committed as `bd7d081` on `fix/training-doc-v2-prelaunch`.

## Outcome

- ✅ Impact: three concrete A2P rejection risks removed; campaign submitted and in review.
- 🧪 Tests: 96 suites / 1321 pass; backend + frontend tsc clean.
- 📁 Files: 5 changed across frontend and backend.
- 🔁 Next prompts: DEPLOY both before the reviewer looks (checkbox screenshot and registered copy must match production); attach the number to the sender pool; after approval, STOP-test from Android and check admin reflects it.
- 🧠 Reflection: filling in the compliance form was itself the audit. Three real defects surfaced from reading the requirements against the code — none would have been found by testing the product, because the product worked; it just didn't match what we were about to register.

## Evaluation notes (flywheel)

- Failure modes observed: a compliance claim documented in one artifact (SMS Terms) does not satisfy a requirement scoped to another (Privacy Policy); registered copy silently drifting from shipped copy.
- Graders run and results (PASS/FAIL): unit PASS (1321/1321); tsc PASS both packages.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a test asserting the live /privacy body contains all three mandated disclosures, so the campaign requirement is pinned by CI rather than by memory.
