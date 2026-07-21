# Message to Karibi — what I need from you

Hey man — short list of things that need you, not me. One of them blocks Android users
from getting texts at all, so that's the one I'd do first.

---

**1. Two pages on the site — this is the blocker**

US carriers won't let us send a single SMS until we pass a registration called A2P 10DLC.
Part of that review is a real person opening our website and checking we have an SMS Terms
page and a Privacy Policy. If either link is dead when they look, we get rejected and go
back to the queue — 1 to 3 business days each time we resubmit.

This does **not** affect iPhone users. Blue bubbles work regardless. It affects every Android
user, so we can't properly launch to a general audience without it.

I need these two live:

- usekiba.ai/sms-terms
- usekiba.ai/privacy

Different paths are fine — just send me the exact URLs and I'll point the signup at them.

**The SMS Terms page — here's the copy, ready to paste.** It's basically dictated by the
carriers, and I wrote it to match exactly what the system actually does:

> **SMS Terms of Service**
>
> KIBA is an AI accountability coaching service. By providing your mobile number during
> signup, you consent to receive recurring automated text messages from KIBA, including
> daily check-ins, reminders you request, and conversational coaching replies.
>
> Message frequency varies based on your plan and how often you message us. Message and data
> rates may apply. Consent is not a condition of purchase.
>
> To stop: reply STOP to any message and you'll be unsubscribed immediately. You'll get one
> confirmation and nothing after that. Reply START to resume.
>
> For help: reply HELP, or email support@usekiba.ai.
>
> Carriers are not liable for delayed or undelivered messages.
>
> Supported carriers include AT&T, Verizon Wireless, T-Mobile, Sprint, and others.

**The Privacy Policy — I'm not going to write this one.** It's a real legal document about
how we handle people's data, and it shouldn't be guesswork. It needs to cover what we collect
(name, number, goals, and the content of messages including photos), that message content is
processed by an AI provider to generate replies, that we use Twilio and SendBlue to deliver
messages and Stripe for payment, how long we keep data and how someone requests deletion, and
a contact address for privacy requests.

One specific line matters: it has to say mobile numbers are **never sold or shared with third
parties for marketing**. Carriers look for exactly that, and leaving it out is a known reason
for rejection.

---

**2. A subdomain pointing at the signup — one DNS record**

Right now usekiba.ai is your Base44 site, and the actual KIBA signup form lives on a Vercel
address that looks like `kiba-blond.vercel.app`. That's the link KIBA texts to every new lead.

Two reasons to fix it before we submit the carrier registration:

- It's the link a lead taps. A raw vercel.app URL in a text message looks like spam, and
  that's the exact moment we're asking someone to hand over their phone number.
- The carrier reviewer is given the signup URL as our proof of opt-in consent. A temporary-
  looking host is a bad look on an application that's specifically about trust.

All I need is a CNAME on usekiba.ai — something like `app.usekiba.ai` or `join.usekiba.ai`,
pointed at the Vercel app. Pick whichever reads better to you, add the record, and I'll do the
rest on our side. It's a five-minute job for you.

**3. support@usekiba.ai needs to exist and be read**

It's now in KIBA's automatic HELP reply, so anyone who texts HELP sees it — and the carrier
reviewer may well email it to check we're real.

---

**4. Two quick calls on the payment page**

**The discount badge.** Monthly is $20 and yearly is $59.99, which works out to about 75% off.
The Tomo screens you sent showed 50%. Just want to confirm 75% is intentional and not a
placeholder price — it's a big number to put on the page.

**The wordmark.** The plan page currently reads "Kiba.ai" but the domain we actually own is
usekiba.ai. Tell me which you want displayed and I'll change it — it's a branding call, not a
technical one, so I left it alone.

---

That's everything. The registration itself I'm handling — I've already got what I need on our
side, and I can start the business verification tonight. It's the two pages that hold up the
rest.
