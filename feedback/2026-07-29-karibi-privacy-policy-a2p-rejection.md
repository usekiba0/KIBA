# Privacy policy fix — Twilio rejected the SMS campaign (2026-07-29)

Karibi — the A2P 10DLC campaign was rejected this morning. It's a one-page copy fix on the
Base44 site, and it's the last thing standing between us and live SMS.

## What happened

Twilio error **30908**:

> the privacy policy in your registration could not be verified as compliant … the privacy
> policy was missing from the website or message_flow, contained conflicting information, or
> did not include the required statement that mobile information and messaging consent are
> not shared with third parties or affiliates for marketing or promotional purposes.

The reviewer landed on **usekiba.ai/privacy** (the Base44 marketing site). That policy is
missing two things the carriers check for by name, and has one line that actively works
against us.

I've already fixed our side — the campaign submission now points explicitly at
`onboarding.usekiba.ai/privacy`, which is fully compliant. But `usekiba.ai` is the website
registered on the Brand, so a reviewer can still check it, and it should match anyway.

## What's wrong with the current page

Your **Text Messages** section currently reads:

> By using KIBA, you agree to receive text messages related to your account, goals,
> reminders, check-ins, and product experience. Message and data rates may apply. You can
> stop receiving messages by replying STOP.

Good, but missing **message frequency** and the **non-sharing statement**.

Your **Sharing Information** section currently reads:

> We do not sell your personal information. We may share information with trusted service
> providers that help us operate KIBA, including messaging providers, payment processors,
> analytics tools, hosting providers, and customer support tools.

This is the "conflicting information" the rejection mentions. It says we share data with
service providers and never carves out mobile numbers or SMS consent. A carrier reviewer
reads that as "they might share numbers." It needs an explicit exception.

One more thing worth knowing: the Base44 page renders entirely in JavaScript. If you fetch
`usekiba.ai/privacy` without a browser you get an empty shell — the policy text isn't in the
HTML. Twilio's automated vetting may not run JavaScript, in which case it saw *no policy at
all*. Nothing you can do about that in Base44, which is exactly why the campaign now points
at our server-rendered page instead. Fixing the copy below still matters for the manual
review pass.

## Drop-in replacement copy

**Replace the "Text Messages" section with:**

> By using KIBA, you agree to receive recurring automated text messages related to your
> account, goals, reminders, check-ins, and product experience. Message frequency varies —
> you'll typically receive one daily check-in at a time you choose, any reminders you ask
> for, and replies to messages you send. Message and data rates may apply. Reply STOP to any
> message to unsubscribe immediately, or HELP for support.
>
> **No mobile information is shared with third parties or affiliates for marketing or
> promotional purposes.** We do not sell, rent, or share your mobile number or your SMS
> consent with anyone for marketing purposes.

**Replace the "Sharing Information" section with:**

> We do not sell your personal information. We may share information with trusted service
> providers that help us operate KIBA, including messaging providers, payment processors,
> analytics tools, hosting providers, and customer support tools — strictly to deliver the
> service, and never for their own marketing.
>
> **Mobile phone numbers and SMS consent are excluded from all sharing.** No mobile
> information is shared with third parties or affiliates for marketing or promotional
> purposes, and mobile opt-in data is never shared with anyone.

The bolded sentences are close to verbatim what the carriers grep for — please keep that
wording rather than paraphrasing it.

## One small extra

The page lists `usekiba@gmail.com` as the contact. `support@usekiba.ai` is live and forwards
to the same inbox, and it's what our HELP reply and our own policy both give out. Worth
switching so the two policies agree — reviewers do notice mismatches.

## Then

Tell me once it's live and I'll resubmit the campaign. Resubmission is free and typically
clears in 1–3 business days.
