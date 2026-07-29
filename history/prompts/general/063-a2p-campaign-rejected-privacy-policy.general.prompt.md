---
id: 063
title: A2P campaign rejected — privacy policy 30908
stage: general
date: 2026-07-29
surface: agent
model: claude-opus-5[1m]
feature: none
branch: fix/crisis-alert-email-nonfatal
user: usekiba0
command: (direct prompt — pasted Twilio rejection email)
labels: ["a2p", "10dlc", "compliance", "privacy-policy", "twilio", "launch-blocker"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - TWILIO_A2P_SETUP.md
 - frontend/.env.example
 - feedback/2026-07-29-karibi-privacy-policy-a2p-rejection.md
tests:
 - none (documentation + env-example only; no code paths changed)
---

## Prompt

User pasted the Twilio rejection email verbatim:

> Action required: campaign CM6898f77d4ec5634c9a027ccf3ba1817d was rejected
>
> Account SID: AC…redacted
> Campaign SID: CM6898f77d4ec5634c9a027ccf3ba1817d
> Brand Registration SID: BN01f55ab5504852e5d89682cc6ac52094
> Use case: MIXED
> Messaging Service: MG…redacted
> Submitted: 2026-07-28T21:34:41.987Z
>
> Rejection reason(s) — Error 30908
>
> Your A2P 10DLC campaign submission was rejected during vetting because the privacy
> policy in your registration could not be verified as compliant. This usually means the
> privacy policy was missing from the website or `message_flow`, contained conflicting
> information, or did not include the required statement that mobile information and
> messaging consent are not shared with third parties or affiliates for marketing or
> promotional purposes.
>
> Next steps: Review and update the campaign in Twilio Console. Resubmit the campaign for
> carrier review.

## Response snapshot

Working memory flagged `bd7d081` (privacy-policy fixes) as "NEEDS DEPLOY", which predicted a
stale-deploy cause. **That hypothesis was wrong** — the deploy had landed. Verified the live
page instead of trusting the note, which found the real cause.

There are two privacy policies. The reviewer read the wrong one:

| | `usekiba.ai/privacy` (Base44, Karibi's) | `onboarding.usekiba.ai/privacy` (ours) |
|---|---|---|
| non-sharing w/ third parties **or affiliates** | ❌ "affiliates" appears nowhere | ✅ |
| message frequency | ❌ | ✅ |
| rates may apply | ✅ | ✅ |
| sharing language | ⚠️ unqualified "we may share information with trusted service providers… including messaging providers" — no mobile carve-out = the "conflicting information" cited | ✅ carve-out explicit |
| server-rendered | ❌ SPA; `curl` → ~5KB empty shell, policy text only inside `/assets/index-*.js` → a non-JS vetting scraper sees **no policy** | ✅ SSR, 18.6KB |

Verified by fetching both hosts and grepping the Base44 JS bundle directly, not by status code
— a 200-only check false-passed this same apex once before (2026-07-22).

Our own defect: the `message_flow` block said only "with links to the SMS Terms and Privacy
Policy" and named **no URL**, so a reviewer had nothing to follow but the Brand website.
Fixed — it now carries both explicit `onboarding.usekiba.ai` URLs plus the required sentence
verbatim.

Chased one further thread: if `NEXT_PUBLIC_PRIVACY_URL` were set to the apex, the consent
screen a reviewer screenshots would link to the bad policy. Grepped the live build chunk
(`app/onboarding/page-c0a4de19d05db3cd.js`) — it carries the relative `"/privacy"`, so the env
vars are unset in production and the live form is safe. But `.env.example` documented the apex
URLs as the values to use, so applying the example would have silently broken it. Defused.

## Outcome

- ✅ Impact: root-caused the launch-blocking rejection to the marketing-site privacy policy;
  fixed our half (message_flow now names the compliant URLs), specified Karibi's half, and
  closed a latent config trap that would have re-broken it.
- 🧪 Tests: none — docs + env-example only. No code paths changed, so the suite is not a
  meaningful signal here; verification was live-fetch + bundle grep instead.
- 📁 Files: `TWILIO_A2P_SETUP.md` (rejection banner, corrected message_flow paste block,
  reversed the "legal pages live on the marketing site" decision, checklist),
  `frontend/.env.example`, new `feedback/2026-07-29-karibi-privacy-policy-a2p-rejection.md`.
- 🔁 Next prompts: resubmit the campaign once Karibi's Base44 copy is live; confirm the
  consent screenshot is taken from `onboarding.usekiba.ai/onboarding`.
- 🧠 Reflection: the 2026-07-21 decision to host legal pages on the marketing site is what
  caused this. Splitting a compliance artifact onto a surface we do not control, and cannot
  content-verify, meant the compliant copy we wrote was never the copy under review.

## Evaluation notes (flywheel)

- Failure modes observed: (1) a memory note ("NEEDS DEPLOY") pointed at a plausible but wrong
  cause — checking the live artifact first was what found the real one; (2) status-code
  verification of an SPA false-passes, and had already done so once on this exact host;
  (3) a compliance document owned by a third party drifted from the one under version control.
- Graders run and results (PASS/FAIL): live content check of both hosts — ours PASS (all three
  disclosures quoted back), apex FAIL (2 of 3 missing + conflicting sharing clause).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): treat "compliance text lives off-repo" as
  requiring a content assertion, not a reachability check — the same grep-the-bundle method
  used here would have caught this before submission.
