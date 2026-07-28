---
id: 046
title: Client feedback batch — checkout polish, pin GIF, latency
stage: general
date: 2026-07-28
surface: agent
model: claude-opus-5[1m]
feature: none
branch: master
user: usekiba0
command: (freeform client feedback triage)
labels: ["stripe", "checkout", "og-image", "retention", "latency", "triage"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/046-client-feedback-batch-checkout-polish.general.prompt.md
tests:
 - none (read-only triage; no code changed)
---

## Prompt

client feedbacks pasting all

[Image #1 — Stripe Checkout on mobile, highlighting the "KIBA" icon slot top-left and the
"Try Monthly Coaching Plan" heading]
[Image #2 — Tomo's iMessage rich link preview: full-bleed branded "Tomo member" image card,
"Open to Continue", tomo.ai]

Can we work on changing that name from monthly coaching plan

Add a shop picture to the stripe in top left

And add a picture to checkout link
Like how Tomo has

[Image #4 — onboarding.usekiba.ai success page: 🎉 "You're in." / "Payment confirmed. KIBA just
texted you..." / "← Back to KIBA"]

We have to edit the text and UI on this too

And also, I have a CTA that takes you straight to the messsages for KIBA so it'll be easier for
them to just go straight there less friction

[Image #5 — live iMessage thread with Marcus: payment link preview renders title+description but
NO image; then "one more thing. pin our chat so i stay at the top and you never lose track of
your day 📌 here's how:" with no media attached]

And the pin GIF isn't sending btw

And can we make the response timing faster

thats all

## Response snapshot

Read-only triage of six items. Findings:

1. **Pin GIF not sending (live regression).** `stripe-webhook.controller.ts:236-245` only sends the
   pin message at all when `PIN_CHAT_MEDIA_URL`/`PIN_CHAT_IMAGE_URL` is set — and the text DID
   arrive in the screenshot, so the env var is set and SendBlue accepted the payload but dropped
   the attachment. Probed every candidate host:
   - `raw.githubusercontent.com/.../pin-chat.mp4` → 200 but `Content-Type: application/octet-stream`
   - `onboarding.usekiba.ai/pin-chat.mp4` → 200 `video/mp4` ✅
   - `kiba-blond.vercel.app/pin-chat.mp4` → 200 `video/mp4` ✅
   - `usekiba.ai/pin-chat.mp4` → 200 `text/html` (client's Base44 site, wrong host — 404 page)
   Prime suspect: the raw-GitHub octet-stream content-type. Needs the current Render value confirmed.

2. **"Try Monthly Coaching Plan"** — Stripe product name, dashboard-only. Note "Try …" is Stripe's
   own trial prefix and cannot be removed; only the product name is ours.

3. **Checkout top-left icon** — Stripe Settings → Business → Branding → Icon. Dashboard-only.
   `kiba-logo-1024.png` already in repo.

4. **Link preview image (Tomo-style)** — real code gap. `frontend/src/app/layout.tsx:5-8` sets only
   `title` + `description`; zero `cache_control`-style `openGraph` block anywhere in the repo
   (grep for `og:image` → no matches). We text our OWN domain (`planLinkFor` →
   `${FRONTEND_URL}/plan?t=…`), so we fully control the card. Needs an OG image asset + per-page
   `openGraph` metadata.

5. **Success page** — `frontend/src/app/onboarding/success/page.tsx` is an all-inline-style dead end
   whose only action is "← Back to KIBA". Client wants copy/UI revision plus an `sms:` deep-link CTA
   into the KIBA thread.

6. **Response timing** — text debounce is already `TEXT_DEBOUNCE_MS = 0`, so that's not it. Real
   findings: **no prompt caching anywhere** (`cache_control` → 0 matches) against a 56 KB
   (~14k token) `coaching.prompt.ts` re-sent uncached every turn; plus up to
   `MAX_TOOL_ITERATIONS = 3` serial round trips and up to 2 additional forced-text completions on
   empty replies (`coaching.service.ts:1101-1218`).

Presented as a triage + proposed order (pin GIF → prompt caching → OG image → success page →
dashboard items), with targeted questions on the new product name, CTA copy/number, and OG art
direction before building.

## Outcome

- ✅ Impact: six client items classified into 3 code builds, 2 dashboard tasks, 1 diagnosis needing a Render value; latency root cause identified as missing prompt caching rather than debounce
- 🧪 Tests: none run — read-only triage, no code changed
- 📁 Files: 1 (this PHR)
- 🔁 Next prompts: confirm `PIN_CHAT_MEDIA_URL` on Render; get new plan name + CTA copy + OG art direction; then implement prompt caching and OG metadata
- 🧠 Reflection: content-type, not reachability, is the failure mode for SMS media — a 200 OK is not proof a host will render as an attachment. Probe `%{content_type}`, not just status.

## Evaluation notes (flywheel)

- Failure modes observed: pin-chat media silently dropped with the text still delivered — a partial send that no log currently distinguishes from success
- Graders run and results (PASS/FAIL): n/a (no code changed)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): log the resolved `pinMediaUrl` + SendBlue response body at the pin-chat send site so the next failure is diagnosable without a device test
