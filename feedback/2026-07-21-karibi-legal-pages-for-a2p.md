# For Karibi — two pages needed on the site (blocks SMS launch)

**Why this matters:** US carriers won't let KIBA send a single SMS until we pass A2P 10DLC
registration, and part of that review is a human checking that our public site carries an
SMS Terms page and a Privacy Policy. If either link 404s when they check, the campaign is
rejected and we go back to the end of the queue (1–3 business days each time).

This doesn't affect iMessage — blue-bubble users are unaffected either way. It affects every
Android user.

We need two pages live at fixed URLs. If you'd rather use different paths, that's fine — just
send me the exact URLs and I'll point the signup form at them.

- `https://usekiba.ai/sms-terms`
- `https://usekiba.ai/privacy`

---

## Page 1 — SMS Terms

This one is mostly dictated by the carriers, so here's the content. It needs to describe what
we *actually* do, and everything below is accurate to how the system behaves today.

> **SMS Terms of Service**
>
> KIBA is an AI accountability coaching service. By providing your mobile number during
> signup, you consent to receive recurring automated text messages from KIBA, including daily
> check-ins, reminders you request, and conversational coaching replies.
>
> **Message frequency varies** based on your plan and how often you message us. Message and
> data rates may apply. Consent is not a condition of purchase.
>
> **To stop:** reply STOP to any message and you'll be unsubscribed immediately. You'll get
> one confirmation and nothing after that. Reply START to resume.
>
> **For help:** reply HELP, or email support@usekiba.ai.
>
> Carriers are not liable for delayed or undelivered messages.
>
> Supported carriers include AT&T, Verizon Wireless, T-Mobile, Sprint, and others.

## Page 2 — Privacy Policy

I'm not going to draft this one — it's a real legal document, it has to reflect how we
actually handle data, and it shouldn't be written by guesswork. It needs to cover at minimum:

- what we collect (name, mobile number, goals, and the content of messages including photos)
- that message content is processed by a third-party AI provider to generate replies
- that we use Twilio and SendBlue to deliver messages, and Stripe for payment
- how long we keep data, and how someone requests deletion
- a contact address for privacy requests

**One thing to flag:** it must say mobile numbers are never sold or shared with third parties
for marketing. Carriers specifically look for that line, and its absence is a known rejection
cause.

---

## What I need back

1. Confirmation both pages are live, with the exact URLs.
2. That `support@usekiba.ai` exists and someone reads it — it's in our HELP auto-reply now,
   so a carrier reviewer may well email it.

Once those land I can submit the campaign. Brand registration I can start immediately since
we have the EIN.
