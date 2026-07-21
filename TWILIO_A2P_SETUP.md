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

### 1. EIN + legal business name (blocks the Brand)
Twilio verifies the Brand against IRS records. **A legal name that doesn't match the EIN
character-for-character is the single most common rejection**, and a near-miss can silently
downgrade you to low trust (worse throughput) rather than failing outright.

You need the EIN confirmation certificate — IRS CP 575, or a 147C if the original is gone.
The same document covers Stripe activation.

### 2. Reachable Privacy Policy + SMS Terms URLs (blocks the Campaign)
Carriers check these. They must be live and public at submission time. **Neither exists
today** — `frontend/src/app` has no `/privacy`, `/terms`, or `/sms-terms` route, and no
legal pages were found anywhere in the repo.

### 3. Opt-in consent language on the signup form (blocks the Campaign)
This is the #1 campaign rejection reason and **it is currently missing**. Verified: no
consent string anywhere in `frontend/src` — no "message and data rates", no "text STOP",
no consent checkbox. The reviewer will ask for a screenshot of the exact screen where the
user gives consent, and right now that screen doesn't say anything.

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

> Web form at https://usekiba.ai — the user enters their goal, their name, their preferred
> daily check-in time, and their mobile number, then submits. Directly above the submit
> button the form states that submitting opts them in to recurring automated text messages
> from KIBA, that message and data rates may apply, that frequency varies, and that they can
> text STOP to cancel or HELP for help, with links to the SMS Terms and Privacy Policy.
> No messages are sent to a number that has not been submitted through this form.

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
[ ] EIN certificate in hand, legal name confirmed character-for-character
[ ] Primary Customer Profile created (not the default starter profile)
[ ] Brand submitted → status Approved (not Failed / not silently low-trust)
[ ] Privacy Policy live at a public URL
[ ] SMS Terms live at a public URL
[ ] Consent language added to the signup form + screenshot taken
[ ] Campaign submitted with description, 4 samples, opt-in flow, STOP/HELP
[ ] Campaign Approved
[ ] Messaging Service created, campaign attached, +1 832 735 5182 added as sender
[ ] Traffic Status = Messaging enabled
[ ] Live end-to-end SMS test to a real Android phone
[ ] Render APP_BASE_URL confirmed = https://kiba-1.onrender.com
```
