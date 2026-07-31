---
id: 044
title: Apple Business brand logo upload
stage: general
date: 2026-07-28
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (conversational — no slash command)
labels: ["apple-business", "branding", "launch-ops", "no-code"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - (none — portal navigation only; no repo changes)
tests:
  - (none — no code changed)
---

## Prompt

> logged in to https://business.apple.com/ where to go to upload logo

(followed by screenshots of Organization Details, Brands > Locations welcome,
the "Choose how you want to add your brand" step, the "Add your brand details"
form, and finally the Brands list showing `KIBA — In Review`; user replies
"done" after filling the form)

## Response snapshot

Walked the user through uploading the KIBA logo to Apple Business.

Navigation path (Apple has merged Apple Business Manager and Apple Business
Connect into a single portal at `business.apple.com`, so the older
`businessconnect.apple.com` guidance is obsolete):

1. Top nav → **Brands**
2. Left sidebar → **Brand Profiles** (NOT **Locations** — that flow is gated to
   businesses with a physical storefront, which KIBA does not have)
3. **Add** → **Single brand**
4. "Add your brand details" form:
   - Brand Name: `KIBA` (display name, not the legal entity `KIBA LABS LLC`)
   - Country/Region: United States
   - Primary Category: closest health/coaching option (Apple's list is
     Maps-oriented and has no exact fit for an SMS AI coach)
   - Brand Website: `https://usekiba.ai`
   - Ownership: "Yes, my organization owns this brand"
5. Logo: `D:\kibi\kiba-logo-1024.png` — 1024×1024 PNG, clears Apple's 800×800
   minimum and matches the Business Chat logo guidelines.

Result: brand **KIBA** submitted, status **In Review**, logo attached.

Domain discrepancy flagged: the Apple **Organization Details** page lists the
org website as `textkiba.com`, but a repo-wide grep found **zero** occurrences
of `textkiba` while `usekiba.ai` appears throughout (checkout service, legal
content, contact card, coaching prompts, `.env.example`). Recommended
`usekiba.ai` for the Brand Website and flagged the org-level field as needing
correction, since Apple can cross-check org vs brand domains.

Also clarified scope: the Apple brand registration brands **calls** (Business
Caller ID) and Apple directory identity. It does **not** brand KIBA's outbound
iMessages — Apple provides no mechanism to brand a text sent to a user first.
That remains the job of the vCard contact card shipped in PR #38.

## Outcome

- ✅ Impact: KIBA brand + 1024px logo submitted to Apple Business; status In Review. Unblocks Business Caller ID once approved.
- 🧪 Tests: none — no code touched.
- 📁 Files: none modified. Referenced existing asset `kiba-logo-1024.png`.
- 🔁 Next prompts: (a) correct org Website `textkiba.com` → `usekiba.ai` on Organization Details; (b) once brand is approved, enable Business Caller ID against the SendBlue number; (c) evaluate Branded Mail for crisis-alert SMTP (needs domain verification first).
- 🧠 Reflection: initial answer sent the user to `businessconnect.apple.com` based on Apple's still-live support docs; the merged portal made that wrong. Screenshots corrected it within one turn — for third-party console navigation, ask for the current screen rather than trusting doc URLs.

## Evaluation notes (flywheel)

- Failure modes observed: stale vendor-console navigation from search results/support docs (Apple merged Business Manager + Business Connect; docs not updated).
- Graders run and results (PASS/FAIL): n/a — no code path exercised.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when guiding through a third-party console, request a screenshot of the current screen before giving a nav path.
