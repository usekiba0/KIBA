# Twilio A2P 10DLC Registration — KIBA

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

### 2. Reachable Privacy Policy + SMS Terms URLs (blocks the Campaign) — ⛔ OUTSTANDING
Carriers check these and a reviewer follows both links. They must be live and public at
submission time. Decision 2026-07-21: they live on the **marketing site**, not this app.
Spec and required content sent to Karibi —
`feedback/2026-07-21-karibi-legal-pages-for-a2p.md`.

The signup form links to `NEXT_PUBLIC_SMS_TERMS_URL` and `NEXT_PUBLIC_PRIVACY_URL`
(`frontend/.env.example`), defaulting to `https://usekiba.ai/sms-terms` and
`https://usekiba.ai/privacy`. **If the real paths differ, set the env vars before
submitting** — a 404 on either link fails the campaign.

### 3. Opt-in consent language on the signup form — ✅ done
Added to `frontend/src/components/OnboardingForm/Step4Contact.tsx`, directly above the
Continue button on the step where the number is entered. States the sender, that messages
are recurring and automated, that frequency varies, that rates may apply, that consent isn't
a condition of purchase, and STOP/HELP — with both legal links.

**Screenshot this screen** for the campaign submission. It is on step 3 of the form (the
Contact step), so it only appears after the goal and psychology steps — reach it at
`<SIGNUP URL>/onboarding`, not on the marketing site.

### 4. The signup lives on a vercel.app host (blocks nothing, but weakens the Campaign)
See the warning under the opt-in flow above. A CNAME on Karibi's side plus a `FRONTEND_URL`
change on ours. Worth doing before submitting rather than after.

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

> Web form at `<SIGNUP URL>/onboarding` — the user enters their goal, their name, their
> preferred daily check-in time, and their mobile number, then submits. Directly above the
> submit button the form states that submitting opts them in to recurring automated text
> messages from KIBA, that message and data rates may apply, that frequency varies, and that
> they can text STOP to cancel or HELP for help, with links to the SMS Terms and Privacy
> Policy. No messages are sent to a number that has not been submitted through this form.

> ⚠️ **`<SIGNUP URL>` is NOT `usekiba.ai`.** Verified 2026-07-21: `usekiba.ai` serves
> Karibi's Base44 marketing site (Base44 favicon, uvicorn origin) — it does not host our
> signup form and a reviewer following it would never see the consent disclosure, which is
> an automatic rejection.
>
> The signup form is the Next.js app at the value of `FRONTEND_URL`, currently
> `https://kiba-blond.vercel.app`. **Before submitting**, point a real subdomain
> (`app.usekiba.ai` / `join.usekiba.ai`) at that app, update `FRONTEND_URL`, and use the
> subdomain here. A raw `vercel.app` host reads as temporary on an application about trust —
> and it's also the link every lead taps in their first text.

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
[ ] Legal name confirmed character-for-character against the certificate
[ ] Primary Customer Profile created (not the default starter profile)
[ ] Brand submitted → status Approved (not Failed / not silently low-trust)
[ ] Privacy Policy live at a public URL          ← Karibi
[ ] SMS Terms live at a public URL               ← Karibi
[ ] support@usekiba.ai mailbox exists + monitored (it's in the HELP reply)
[ ] Subdomain (app./join.usekiba.ai) CNAME'd to the Vercel app   ← Karibi
[ ] FRONTEND_URL updated to the subdomain, links in texts re-checked
[ ] NEXT_PUBLIC_SMS_TERMS_URL / NEXT_PUBLIC_PRIVACY_URL set to the real paths
[ ] Opt-in URL in the campaign = the SIGNUP host, NOT usekiba.ai
[x] Consent language on the signup form
[ ] Screenshot of the consent screen taken for submission
[ ] Campaign submitted with description, 4 samples, opt-in flow, STOP/HELP
[ ] Campaign Approved
[ ] Messaging Service created, campaign attached, +1 832 735 5182 added as sender
[ ] Traffic Status = Messaging enabled
[ ] Live end-to-end SMS test to a real Android phone
[ ] Render APP_BASE_URL confirmed = https://kiba-1.onrender.com
```
