---
id: 045
title: A2P campaign unblocked plus domain audit
stage: general
date: 2026-07-28
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (conversational — no slash command)
labels: ["twilio-a2p", "domains", "dns", "launch-ops", "verification"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - TWILIO_A2P_SETUP.md
tests:
  - Live HTTP probes of onboarding.usekiba.ai, usekiba.ai, textkiba.com (incl. bogus-path control)
  - DNS MX/TXT resolution for usekiba.ai
---

## Prompt

> (Twilio console paste showing Trust Hub → Registrations → A2P Brands:
> `KIBA LABS LLC / BN01f55ab5504852e5d89682cc6ac52094 / Low volume standard /
> Trust score N/A / Jul 22, 2026 / Approved`)

> chhanged to text kiba.com

> https://textkiba.com/sms-terms this link donot exist

## Response snapshot

**1. A2P Brand is APPROVED** (2026-07-28) — the campaign is unblocked. Supplied
paste-ready campaign blocks from `TWILIO_A2P_SETUP.md`: use case `Low Volume
Mixed`, campaign description, 4 real sample messages, opt-in flow, STOP/HELP
handling. Trust score `N/A` is expected for Low-Volume Standard (skips secondary
vetting).

**2. Domain audit — the important finding.** A `200` status code is NOT a valid
liveness test against these hosts:

| Host | Server | `/sms-terms` | bogus path | Verdict |
|---|---|---|---|---|
| `onboarding.usekiba.ai` | Vercel | 200, 11.6KB, real title, STOP+rates lang | **404** | ✅ real |
| `usekiba.ai` | Cloudflare | 200, ~5.6KB, no title | **200** | ❌ catch-all shell |
| `textkiba.com` | Cloudflare | 200, ~6.3KB, no title | **200** | ❌ catch-all shell |

The bogus-path control (`/this-path-does-not-exist-zzz`) returned 200 on both
apexes — with a *larger* body than the real paths. User visually confirmed
`textkiba.com/sms-terms` does not exist.

**Consequence: the 2026-07-22 checklist line claiming legal pages were "verified
live (200) on BOTH onboarding.usekiba.ai and usekiba.ai" was a FALSE PASS for
the apex.** Corrected in `TWILIO_A2P_SETUP.md`. No harm done — the campaign was
always going to point at `onboarding.usekiba.ai`.

**3. DNS unaffected.** Checked because the apex web host moved to Cloudflare and
the crisis-alert email chain depends on `usekiba.ai` records:
`MX → mx1/mx2.improvmx.com` intact, `SPF include:spf.improvmx.com` intact,
`apple-domain-verification=OcFJ8qXCpuAdiZKm` present, NS still GoDaddy
(`ns09/ns10.domaincontrol.com`). Crisis alerts to `coach@usekiba.ai` still
forward. Only apex web hosting changed.

**4. Guidance given:** `textkiba.com` is acceptable as an Apple *brand/marketing*
website but must NEVER be the A2P opt-in URL or legal-link host. Also noted the
`apple-domain-verification` TXT lives on `usekiba.ai`, arguing for keeping the
Apple brand website field on `usekiba.ai`.

**5. Open question raised (unanswered):** did the user change only the Apple
brand-website field, or is `textkiba.com` now the canonical customer-facing
domain? The latter is a real migration — `usekiba.ai` is embedded in the
checkout service, legal content, contact card, and coaching prompts, plus Stripe
domain verification and ImprovMX forwarding.

## Outcome

- ✅ Impact: A2P Brand approved → campaign unblocked; caught a false-pass verification and corrected the tracker; confirmed the email chain survived the DNS/host change.
- 🧪 Tests: live HTTP probes with a bogus-path control + DNS MX/TXT resolution. No unit tests run (no code changed).
- 📁 Files: `TWILIO_A2P_SETUP.md` (brand approved, FRONTEND_URL/legal items closed, false-pass warning added).
- 🔁 Next prompts: (a) user submits the campaign + consent screenshot from step 3 of `/onboarding`; (b) Messaging Service + attach `+18327355182`; (c) live Android SMS test; (d) confirm Render `APP_BASE_URL=https://kiba-1.onrender.com`; (e) resolve the textkiba.com-vs-usekiba.ai canonical-domain question.
- 🧠 Reflection: status-code-only checks are worthless against client-rendered SPAs — always probe a deliberately invalid path as a control. That single extra request overturned a week-old "verified" claim.

## Evaluation notes (flywheel)

- Failure modes observed: false-pass liveness check (HTTP 200 from an SPA catch-all recorded as "page is live"); stale checklist entries (FRONTEND_URL already set on Render 07-22 but still unticked).
- Graders run and results (PASS/FAIL): PASS — `onboarding.usekiba.ai` legal pages content-verified; PASS — `usekiba.ai` MX/SPF intact.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when verifying any external URL, always probe a known-bad sibling path in the same batch as a control before recording the result.
