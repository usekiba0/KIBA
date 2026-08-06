# Karibi — messages READY TO SEND, not yet sent (2026-08-06)

Three WhatsApp messages, final wording, approved by the founder. WhatsApp formatting
(`*bold*` = single asterisks). Send 1 and 2 together; 3 is its own conversation.

**Already sent 2026-08-05 22:48** — the SendBlue latency reply (lag 2.6s → 1.7s, "instant"
isn't achievable, typing bubble covers the friction). Do NOT resend it.

---

## MESSAGE 1 — answers "can u turn on the instant read message and the typing bubble"

> Both are already live. Typing bubble fires on every message coming in — I checked our
> logs, zero failures across every thread. And read receipts are on too, just confirmed it:
> messages show "Read" not "Delivered", so they see KIBA has seen it the moment it lands.
>
> So on the friction your testers mentioned — that's covered from both ends now. They see
> "Read" straight away, then the "…" typing bubble while she's answering. No dead air
> wondering if it went through.

---

## MESSAGE 2 — answers "any update w the apple masking"

Deliberately forward-looking: the founder asked NOT to mention that the contact-card ask
was broken, only what happens from here. Wording is accurate without overclaiming.

> Apple masking — good news. KIBA is now Verified with Apple, name and logo approved. Went
> in July 28 and it's cleared.
>
> Straight with you on what that covers: it brands calls. Apple has no mechanism to brand a
> text you send someone first — that doesn't exist for anybody, it's not a gap in our build.
>
> What puts KIBA + the logo on the texts is the contact card, and that's now going out
> properly. Here's what happens from here: as users come through their next check-in, KIBA
> sends them her contact card and asks them to save it. One tap. Once they do, every message
> from then on shows KIBA + the logo instead of a random number — and it also keeps her out
> of iOS's unknown-sender filter, so she always lands in the inbox.
>
> Being verified also unlocks Business Caller ID and Branded Mail if you want them down the
> line — neither is needed for texts.

---

## MESSAGE 3 — the privacy policy / A2P blocker. Send as its own conversation.

Supersedes `2026-07-29-karibi-whatsapp-privacy-fix.md`, whose "rejected this morning"
framing is now a week stale. Copy blocks below are UNCHANGED from that draft on purpose —
the bolded sentences are close to verbatim what carriers grep for.

> Hey Karibi — one thing left on my list that needs you, and it's the last gate before
> launch.
>
> The Twilio SMS campaign is still rejected. I checked usekiba.ai/privacy again today and
> it's showing the same copy, so this hasn't been done yet. It's free to resubmit — it just
> needs the page fixed first.
>
> *Why it got rejected*
>
> Before approving a business to send texts, the carriers check its privacy policy. The
> reviewer landed on usekiba.ai/privacy and it's missing two things they require by name:
>
> 1. A statement that mobile numbers and SMS consent are never shared with third parties
> *or affiliates* for marketing
> 2. How often we message people (message frequency)
>
> There's also a line in the "Sharing Information" section working against us — it says we
> may share information with service providers including messaging providers, with no
> exception carved out for phone numbers. A reviewer reads that as "they might pass numbers
> on."
>
> *What I need from you*
>
> Two sections on usekiba.ai/privacy. Please replace them with the text below exactly — the
> bold sentences are close to word-for-word what the carriers scan for, so it's worth not
> rewording them.
>
> Replace *Text Messages* with:
>
> By using KIBA, you agree to receive recurring automated text messages related to your
> account, goals, reminders, check-ins, and product experience. Message frequency varies —
> you'll typically receive one daily check-in at a time you choose, any reminders you ask
> for, and replies to messages you send. Message and data rates may apply. Reply STOP to any
> message to unsubscribe immediately, or HELP for support.
>
> *No mobile information is shared with third parties or affiliates for marketing or
> promotional purposes.* We do not sell, rent, or share your mobile number or your SMS
> consent with anyone for marketing purposes.
>
> Replace *Sharing Information* with:
>
> We do not sell your personal information. We may share information with trusted service
> providers that help us operate KIBA, including messaging providers, payment processors,
> analytics tools, hosting providers, and customer support tools — strictly to deliver the
> service, and never for their own marketing.
>
> *Mobile phone numbers and SMS consent are excluded from all sharing.* No mobile
> information is shared with third parties or affiliates for marketing or promotional
> purposes, and mobile opt-in data is never shared with anyone.
>
> *One small extra*
>
> That page lists usekiba@gmail.com as the contact. support@usekiba.ai is live and forwards
> to the same inbox, and it's the address our texts give out. Worth switching so the two
> match — reviewers do notice mismatches.
>
> *Where everything else stands*
>
> Everything else is done. SendBlue fixed the lag, Apple's verified us, the read receipts
> and typing bubble are live, and I've already pointed the campaign at our own policy page
> (onboarding.usekiba.ai/privacy) which carries all the required language. Yours still needs
> doing because usekiba.ai is the website registered against the brand, so a reviewer can
> check it either way.
>
> This is genuinely the only thing left. Shout when it's live and I'll verify it and
> resubmit the same day — approval runs 1–3 business days from there.

---

## ⚠️ When Karibi says the policy is done

**Verify by CONTENT, never by status code.** `usekiba.ai/privacy` is a JavaScript SPA — it
returns `200 OK` with a ~5KB empty shell and the policy text lives only inside
`/assets/index-*.js`. A 200-only check has false-passed on this exact domain twice.

```
curl -s https://usekiba.ai/privacy | grep -oE '/assets/[A-Za-z0-9._-]+\.js'
curl -s https://usekiba.ai/assets/<hash>.js > b.js
grep -ci "affiliate\|message frequency\|third part" b.js
```

Checked 2026-08-06: `affiliate` = 4 hits, ALL of them React's "Facebook, Inc. and its
affiliates" copyright banner, ZERO in policy text. `message frequency` = 0.
`third part` = 0. So it is genuinely unchanged, not a caching artifact.
