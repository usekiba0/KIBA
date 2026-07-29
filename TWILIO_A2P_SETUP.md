# Twilio A2P 10DLC Registration — KIBA

## ⛔ CAMPAIGN REJECTED 2026-07-29 — error 30908 (privacy policy)

Campaign `CM6898f77d4ec5634c9a027ccf3ba1817d` (submitted 2026-07-28T21:34Z) was rejected:

> the privacy policy in your registration could not be verified as compliant. This usually
> means the privacy policy was missing from the website or `message_flow`, contained
> conflicting information, or did not include the required statement that mobile information
> and messaging consent are not shared with third parties or affiliates for marketing or
> promotional purposes.

**Root cause — the reviewer read the wrong privacy policy.** There are two, and only one is
compliant:

| | `usekiba.ai/privacy` (Karibi's Base44 site) | `onboarding.usekiba.ai/privacy` (ours) |
|---|---|---|
| Non-sharing of mobile info w/ third parties **or affiliates** for marketing | ❌ absent — the word "affiliates" does not appear anywhere | ✅ present, carrier-preferred wording |
| Message frequency | ❌ absent | ✅ "Message frequency varies." |
| Message and data rates may apply | ✅ present | ✅ present |
| Sharing language | ⚠️ **"We may share information with trusted service providers… including messaging providers, payment processors, analytics tools"** — an unqualified sharing statement with no marketing carve-out. This is the "conflicting information" the rejection names. | ✅ carve-out explicit |
| Server-rendered? | ❌ **No** — Base44 React SPA. `curl` returns a ~5KB shell with an empty body; the policy text exists only inside `/assets/index-*.js`. An automated vetting scraper that does not run JS sees **no policy at all** → "missing from the website". | ✅ Next.js SSR, 18.6KB of real HTML |

Verified 2026-07-29 by fetching both hosts and grepping the Base44 JS bundle directly.

**The fix, in two parts:**

1. **Ours (done, in this file):** the `message_flow` block below now carries the explicit
   `onboarding.usekiba.ai` Privacy Policy and SMS Terms URLs plus the required sentence
   verbatim. Previously it only said "with links to the SMS Terms and Privacy Policy" — it
   named no URL, so a reviewer fell back to the Brand website (`usekiba.ai`) and found the
   non-compliant policy. **Paste the updated block into the campaign before resubmitting.**
2. **Karibi's (outstanding):** the Base44 policy at `usekiba.ai/privacy` still needs the
   missing language, because it is the Brand's registered website and a reviewer may check it
   regardless. Drop-in copy is specified in
   `feedback/2026-07-29-karibi-privacy-policy-a2p-rejection.md`.

Resubmit via Console → Messaging → Regulatory Compliance → A2P 10DLC → the campaign → edit →
resubmit. Resubmission is free; there is no penalty for a second attempt.

---

**Live status, verified against the Twilio API 2026-07-21:**

| Thing | State |
|---|---|
| A2P Brand registrations | **0 — never started** |
| Messaging Services | **0 — none exist** |
| Campaigns | none (can't exist without a Brand) |
| Number `+1 832 735 5182` | exists, `in-use`, inbound webhook correct |
| Trust Hub profile | only `My first Twilio account` (the default starter profile — **not** a Primary Customer Profile with business details) |

So nothing has been done yet, and every step below is outstanding. Approval typically
takes **1–3 business days** after submission, and the Brand must clear before the Campaign
can even be created — so this is sequential, not parallel.

> Twilio is KIBA's **SMS fallback**. iMessage via SendBlue is primary and needs no A2P. But
> every Android user, and every iMessage send that fails over, depends on this number.

---

## Blockers, in the order they'll stop you

**Resolved 2026-07-21:** the EIN certificate is in hand, so Brand registration can start
now. The consent language is built (`Step4Contact.tsx`) and the HELP reply carries a support
contact. The remaining blocker is the two legal pages, which live on the marketing site —
spec sent to Karibi in `feedback/2026-07-21-karibi-legal-pages-for-a2p.md`.

### 1. EIN + legal business name (blocks the Brand) — ✅ have it
Twilio verifies the Brand against IRS records. **A legal name that doesn't match the EIN
character-for-character is the single most common rejection**, and a near-miss can silently
downgrade you to low trust (worse throughput) rather than failing outright.

You need the EIN confirmation certificate — IRS CP 575, or a 147C if the original is gone.
The same document covers Stripe activation.

### 2. Reachable Privacy Policy + SMS Terms URLs (blocks the Campaign) — ✅ ours, ⛔ apex
Carriers check these and a reviewer follows both links. They must be live and public at
submission time.

**Reversed 2026-07-29.** The 2026-07-21 decision was to host these on the **marketing site**.
That decision is what caused the campaign rejection — see the banner at the top of this file.
The authoritative, compliant text is now **this app's own** pages, served from
`backend/src/data/legal-content.ts` at `onboarding.usekiba.ai/{privacy,sms-terms}`.

`NEXT_PUBLIC_SMS_TERMS_URL` / `NEXT_PUBLIC_PRIVACY_URL` are deliberately **unset** in
production — verified 2026-07-29 by grepping the live build chunk, which carries the relative
`"/privacy"` and `"/sms-terms"`. Leave them unset. Pointing them at the `usekiba.ai` apex
would aim the consent screen a reviewer screenshots at the non-compliant Base44 policy.

### 3. Opt-in consent language on the signup form — ✅ done
Added to `frontend/src/components/OnboardingForm/Step4Contact.tsx`, directly above the
Continue button on the step where the number is entered. States the sender, that messages
are recurring and automated, that frequency varies, that rates may apply, that consent isn't
a condition of purchase, and STOP/HELP — with both legal links.

**Screenshot this screen** for the campaign submission. It is on step 3 of the form (the
Contact step), so it only appears after the goal and psychology steps — reach it at
`<SIGNUP URL>/onboarding`, not on the marketing site.

### 4. FRONTEND_URL still points at the raw vercel.app host
The branded domain exists, but `FRONTEND_URL` on Render is still
`https://kiba-blond.vercel.app` — so that is the link every lead taps in their first text.
Change it to `https://onboarding.usekiba.ai`. One env field, no code change, no deploy.

---

## Step 1 — Primary Customer Profile

Console → **Trust Hub → Customer Profiles → Create**. The existing `My first Twilio account`
profile is the starter one and is not sufficient.

Legal business name, EIN, business address, website, authorized representative.

## Step 2 — Register the Brand

Trust Hub → **A2P 10DLC → Create Brand**, attached to the profile from Step 1.

- Business type: **Private / for-profit** unless incorporated otherwise
- Legal name + EIN must match the certificate exactly
- **Standard vs Low-Volume:** Low-Volume Standard is right for a 20-user beta and skips the
  ~$40 secondary vetting fee. Upgrade later if volume grows.

## Step 3 — Register the Campaign

Trust Hub → A2P 10DLC → **Create Campaign** under the approved Brand.

**Use case:** `Mixed` (or `Low Volume Mixed`) — KIBA sends onboarding/account notifications,
scheduled coaching check-ins, and two-way conversational replies, which spans categories.

**Campaign description** (paste):

> AI accountability-coaching service. Users sign up on the web, enter their phone number,
> and consent to receive messages. They then receive a daily check-in at a time they choose,
> reminders they explicitly ask for in conversation, and two-way conversational coaching
> replies to messages they send.

**Sample messages** — these are real, from the live templates and production sends:

1. `morning Karibi. gym at 8am — what's the plan?`
2. `30 min till gym. you ready to move?`
3. `gym time was 15 min ago. breakfast + workout proof. send it.`
4. `You're unsubscribed from KIBA. You won't get any more messages. Text START if you ever want back in.`

**Opt-in flow** (paste, once Step 3 of the blockers above is done):

> Web form at https://onboarding.usekiba.ai/onboarding — the user enters their goal, their
> name, their preferred daily check-in time, and their mobile number, then ticks an unchecked
> consent checkbox before the submit button enables. Directly above that checkbox the form
> states that submitting opts them in to recurring automated text messages from KIBA, that
> message and data rates may apply, that frequency varies, that consent is not a condition of
> purchase, and that they can text STOP to cancel or HELP for help. No messages are sent to a
> number that has not been submitted through this form.
>
> Privacy Policy: https://onboarding.usekiba.ai/privacy
> SMS Terms of Service: https://onboarding.usekiba.ai/sms-terms
>
> The Privacy Policy states: "We do not sell, rent, or share your mobile number or SMS
> consent with third parties or affiliates for marketing purposes. Mobile opt-in data is
> never shared with anyone."

> ⚠️ **RE-VERIFIED 2026-07-28 — only `onboarding.usekiba.ai` is trustworthy.**
>
> Both marketing apexes — `usekiba.ai` AND the new `textkiba.com` — are now
> Cloudflare-fronted **catch-all SPAs that return 200 for ANY path**, including
> invented ones (`/this-path-does-not-exist-zzz` → 200, ~6KB shell). A 200 on
> those hosts proves nothing. The user confirmed by eye that
> `textkiba.com/sms-terms` does not exist. **This means the 2026-07-22 note
> claiming legal pages were "verified live (200) on BOTH onboarding.usekiba.ai
> and usekiba.ai" was a FALSE PASS for the apex** — status-code checks alone are
> not a valid test against an SPA shell.
>
> `onboarding.usekiba.ai` (Vercel) is real and was content-verified 2026-07-28:
> `/sms-terms` 11.6KB `title='SMS Terms of Service — KIBA'` with STOP + rates
> language; `/privacy` 18.6KB `title='Privacy Policy — KIBA'`; and a bogus path
> correctly **404s**. Use this host for the opt-in URL and both legal links.
>
> ✅ **RESOLVED 2026-07-22 — `<SIGNUP URL>` = `https://onboarding.usekiba.ai`.**
>
> `usekiba.ai` itself serves Karibi's Base44 marketing site (apex A → Render,
> `www` → `base44.onrender.com`), so it must NOT be used as the opt-in URL — a
> reviewer following it never reaches the consent disclosure, which is an
> automatic rejection.
>
> But the GoDaddy zone already carried `onboarding` → `…vercel-dns-017.com`,
> pointing at our Next.js app. Verified live and serving both `/onboarding` and
> `/sms-terms`. The branded host existed all along; no DNS change was needed.
>
> Optional polish: `join.usekiba.ai` reads better than `onboarding.` in the text
> a lead receives. One CNAME plus a Vercel domain add — nice to have, not a blocker.

**Opt-out / HELP handling:**

> STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, OPTOUT all unsubscribe the user immediately
> and send one final confirmation. START, UNSTOP, and RESUME re-subscribe. HELP and INFO
> return the program name, that message and data rates may apply, and how to unsubscribe.

That last paragraph is **true as of 2026-07-21** and enforced in code, not by an AI:
`backend/src/messaging/opt-out.ts` does the keyword detection, the block lives at the single
outbound chokepoint in `MessagingService.send()` and fails closed, and opting out also drains
the user's queued jobs. Covered by 47 unit tests.

## Step 4 — Messaging Service + attach the number

Create a Messaging Service, attach the approved campaign, add `+1 832 735 5182` as a sender.

Outbound sends currently pass `from = TWILIO_PHONE_NUMBER` directly. That keeps working —
the Messaging Service is the A2P attachment mechanism, not a code change.

## Step 5 — Confirm

- Numbers & Senders → Traffic Status flips from *"Messaging disabled"* to enabled
- Send a real SMS to a real Android phone end-to-end

---

## Separate but related: the inbound webhook

The number's inbound SMS webhook is already correct:
`https://kiba-1.onrender.com/v1/webhooks/sms` (note the `/v1/` prefix).

For inbound SMS to pass signature validation, Render's `APP_BASE_URL` must equal
`https://kiba-1.onrender.com` exactly. If it holds the `.env.example` placeholder instead,
every inbound SMS 401s in `backend/src/messaging/guards/twilio-webhook.guard.ts`. **Worth
confirming in the Render dashboard** — it's silent when wrong.

---

## Checklist

```
[x] EIN certificate in hand
[x] Legal name confirmed character-for-character against the certificate
[x] Primary Customer Profile created → Trust Hub profile APPROVED 2026-07-22
[x] Brand APPROVED 2026-07-28 (BN01f55ab5504852e5d89682cc6ac52094, Low-Volume
    Standard, KIBA LABS LLC, industry PROFESSIONAL_SERVICES). Trust score N/A
    is normal for Low-Volume Standard — it skips secondary vetting.
    <-- Campaign is now UNBLOCKED (Step 3 above).
[x] Privacy Policy live — https://onboarding.usekiba.ai/privacy (200, re-verified 2026-07-28; PR #26)
[x] SMS Terms live — https://onboarding.usekiba.ai/sms-terms (200, re-verified 2026-07-28)
[x] support@usekiba.ai mailbox — ImprovMX catch-all forwards ALL usekiba.ai mail
    to usekiba@gmail.com (set up 2026-07-22, MX + CNAME updated)
[x] Branded subdomain live — onboarding.usekiba.ai (already existed in the zone)
[x] FRONTEND_URL on Render -> https://onboarding.usekiba.ai (set in the 2026-07-22 Render batch)
[x] NEXT_PUBLIC_SMS_TERMS_URL / NEXT_PUBLIC_PRIVACY_URL — defaults resolve; both 200 on
    onboarding.usekiba.ai, verified 2026-07-28
[ ] Opt-in URL in the campaign = https://onboarding.usekiba.ai/onboarding, NOT usekiba.ai
    (verified 200 on 2026-07-28)
[x] Consent language on the signup form
[ ] Screenshot of the consent screen taken for submission
[x] Campaign submitted 2026-07-28 with description, 4 samples, opt-in flow, STOP/HELP
[!] Campaign REJECTED 2026-07-29 — error 30908, privacy policy. See the banner at the top
    of this file. Two things must both be true before resubmitting:
[ ]   a) message_flow carries the explicit onboarding.usekiba.ai privacy + SMS terms URLs
         (copy is updated in this file — still needs pasting into the Console)
[ ]   b) usekiba.ai/privacy carries the non-sharing + frequency language (Karibi's court —
         spec in feedback/2026-07-29-karibi-privacy-policy-a2p-rejection.md)
[ ] Campaign resubmitted
[ ] Campaign Approved
[ ] Messaging Service created, campaign attached, +1 832 735 5182 added as sender
[ ] Traffic Status = Messaging enabled
[ ] Live end-to-end SMS test to a real Android phone
[ ] Render APP_BASE_URL confirmed = https://kiba-1.onrender.com
```
