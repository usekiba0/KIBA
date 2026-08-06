# usekiba.ai/privacy — exact drop-in edit (A2P 30908 fix)

Ready to execute the moment we get Base44 access. Two sections, find-and-replace.
Verified against the live bundle `https://usekiba.ai/assets/index-CAlipZ0y.js` on 2026-08-06.

The site is a Vite/React SPA, so the policy text lives in JSX inside the bundle — in the
Base44 editor these are two ordinary text blocks titled **Text Messages** and
**Sharing Information**.

---

## 1. Section "Text Messages"

**FIND (live text, word for word):**

> By using KIBA, you agree to receive text messages related to your account, goals,
> reminders, check-ins, and product experience. Message and data rates may apply. You can
> stop receiving messages by replying STOP.

**REPLACE WITH:**

> By using KIBA, you agree to receive recurring automated text messages related to your
> account, goals, reminders, check-ins, and product experience. Message frequency varies —
> you'll typically receive one daily check-in at a time you choose, any reminders you ask
> for, and replies to messages you send. Message and data rates may apply. Reply STOP to any
> message to unsubscribe immediately, or HELP for support.
>
> No mobile information is shared with third parties or affiliates for marketing or
> promotional purposes. We do not sell, rent, or share your mobile number or your SMS
> consent with anyone for marketing purposes.

**What each added phrase is for:**

| phrase | why the carrier needs it |
|---|---|
| "recurring automated" | discloses the messages are automated + ongoing |
| "Message frequency varies — …" | the explicit **message frequency** disclosure. Currently absent |
| "or HELP for support" | HELP keyword disclosure to match STOP |
| "third parties **or affiliates**" | the exact phrase reviewers grep for. "third parties" alone has failed before |

---

## 2. Section "Sharing Information"

⚠️ This one is not just incomplete — the live text **names messaging providers as a sharing
recipient with no carve-out for phone numbers**, which reads to a reviewer as "they may pass
numbers on." This is likely what actually triggered 30908.

**FIND (live text, word for word):**

> We do not sell your personal information. We may share information with trusted service
> providers that help us operate KIBA, including messaging providers, payment processors,
> analytics tools, hosting providers, and customer support tools.

**REPLACE WITH:**

> We do not sell your personal information. We may share information with trusted service
> providers that help us operate KIBA, including messaging providers, payment processors,
> analytics tools, hosting providers, and customer support tools — strictly to deliver the
> service, and never for their own marketing.
>
> Mobile phone numbers and SMS consent are excluded from all sharing. No mobile information
> is shared with third parties or affiliates for marketing or promotional purposes, and
> mobile opt-in data is never shared with anyone.

---

## 3. Optional, same visit — contact address

Not a blocker; do not let it delay the two sections above.

`usekiba@gmail.com` appears 10 times in the bundle, including the mailto link in the
"Your Choices" section. `support@usekiba.ai` is live, forwards to the same inbox, and is the
address our texts hand out. Reviewers notice the mismatch between the policy contact and the
in-message support address.

Replace every `usekiba@gmail.com` with `support@usekiba.ai` (both the link text and the
`mailto:` href).

---

## 4. Post-edit verification — MANDATORY, by content

The page returns `200 OK` on a ~5KB empty shell whether or not the edit landed. A status-code
check has false-passed on this exact domain twice.
See [[feedback_verify_offrepo_compliance_by_content]].

```bash
# the bundle hash CHANGES on every deploy — re-read it, never reuse the old one
curl -s https://usekiba.ai/privacy | grep -oE '/assets/[A-Za-z0-9._-]+\.js'
curl -s https://usekiba.ai/assets/<new-hash>.js -o bundle.js

grep -ci "message frequency"  bundle.js   # must be >= 1
grep -ci "mobile information" bundle.js   # must be >= 1
grep -ci "opt-in data"        bundle.js   # must be >= 1
grep -ci "excluded from all sharing" bundle.js   # must be >= 1
```

❌ **Do NOT use `grep -c affiliate` as the check.** React's license banner
("Copyright (c) Facebook, Inc. and its affiliates") puts a floor of 4 hits in the bundle
whether or not the policy says a word about affiliates. That false signal is what made this
look done twice.

A changed bundle hash alone also proves nothing — any unrelated deploy changes it.

## 5. Then

Resubmit the Twilio campaign (CM6898f77d…). Approval runs 1–3 business days.
See [[project_kiba_a2p_campaign_2026_07_29]].
