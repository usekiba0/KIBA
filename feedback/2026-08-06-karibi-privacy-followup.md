# Karibi — privacy policy follow-up (2026-08-06)

Chase message for the A2P blocker. Assumes the original ask (Message 3 in
`2026-08-06-karibi-messages-pending.md`) already went out. **If it never sent, send that
full version instead** — this one references an earlier ask and will read oddly cold.

WhatsApp formatting (`*bold*` = single asterisks).

---

## Live state, verified 2026-08-06

Bundle: `https://usekiba.ai/assets/index-CAlipZ0y.js` (494 KB).

| check | result |
|---|---|
| `message frequency` | **0 hits** |
| `affiliate` | 4 hits — **all four are React's "Facebook, Inc. and its affiliates" license banner**, zero in policy text |
| `third part` / `mobile information` / `opt-in data` | 0 hits |
| `usekiba@gmail` | 10 hits |
| `support@usekiba` | 0 hits |

Current live copy, word for word:

- **Text Messages** — "By using KIBA, you agree to receive text messages related to your
  account, goals, reminders, check-ins, and product experience. Message and data rates may
  apply. You can stop receiving messages by replying STOP."
- **Sharing Information** — "We do not sell your personal information. We may share
  information with trusted service providers that help us operate KIBA, including messaging
  providers, payment processors, analytics tools, hosting providers, and customer support
  tools."

⚠️ The Sharing Information paragraph is not merely incomplete — it **names messaging
providers as a sharing recipient with no carve-out for phone numbers**, which is close to
the exact pattern a 30908 reviewer scans for.

---

## THE MESSAGE

> Hey Karibi — circling back on the privacy policy. I checked usekiba.ai/privacy again this
> morning and it's still the old copy, so this hasn't been done yet.
>
> Not chasing you for the sake of it — this is genuinely the last thing standing between us
> and launch. Everything on my side is finished: SendBlue fixed the lag, Apple's verified
> us, read receipts and the typing bubble are live, the contact card is going out. The
> campaign is sitting rejected on one page of text.
>
> To make it as easy as possible, here's the whole job. Two paragraphs on that page, swap
> them out, done:
>
> *1. Replace the "Text Messages" section with:*
>
> By using KIBA, you agree to receive recurring automated text messages related to your
> account, goals, reminders, check-ins, and product experience. Message frequency varies —
> you'll typically receive one daily check-in at a time you choose, any reminders you ask
> for, and replies to messages you send. Message and data rates may apply. Reply STOP to any
> message to unsubscribe immediately, or HELP for support.
>
> No mobile information is shared with third parties or affiliates for marketing or
> promotional purposes. We do not sell, rent, or share your mobile number or your SMS
> consent with anyone for marketing purposes.
>
> *2. Replace the "Sharing Information" section with:*
>
> We do not sell your personal information. We may share information with trusted service
> providers that help us operate KIBA, including messaging providers, payment processors,
> analytics tools, hosting providers, and customer support tools — strictly to deliver the
> service, and never for their own marketing.
>
> Mobile phone numbers and SMS consent are excluded from all sharing. No mobile information
> is shared with third parties or affiliates for marketing or promotional purposes, and
> mobile opt-in data is never shared with anyone.
>
> Please paste those exactly — the wording is close to word-for-word what the carriers scan
> for, so rewording it is what gets us rejected again.
>
> *Or — I'll just do it*
>
> If it's easier, give me access to the Base44 site and I'll make the change myself in ten
> minutes and you never think about it again. Genuinely happy to.
>
> Either way, shout the moment it's live. I'll verify it and resubmit the same day, and
> approval runs 1–3 business days from there.

---

## ⚠️ Verification method when he says it's done

**By CONTENT, never by status code.** `usekiba.ai/privacy` is a JS SPA — 200 OK on a ~5KB
empty shell, policy text lives only in `/assets/index-*.js`. This has false-passed twice.

```
curl -s https://usekiba.ai/privacy | grep -oE '/assets/[A-Za-z0-9._-]+\.js'
curl -s https://usekiba.ai/assets/<hash>.js -o bundle.js
grep -ci "message frequency" bundle.js      # must be >= 1
grep -ci "mobile information" bundle.js     # must be >= 1
grep -ci "opt-in data" bundle.js            # must be >= 1
```

`affiliate` alone is NOT a valid check — React's license banner floors it at 4.
See [[feedback_verify_offrepo_compliance_by_content]].

## Optional extra, not a blocker

That page lists `usekiba@gmail.com` (10 occurrences). `support@usekiba.ai` is live, forwards
to the same inbox, and is the address our texts hand out. Reviewers do notice mismatches —
worth folding into the same edit, but do not let it delay the two required paragraphs.
