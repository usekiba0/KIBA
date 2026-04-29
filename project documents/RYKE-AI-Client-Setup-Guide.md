# RYKE AI — Third-Party Services Setup Guide

**Prepared for:** RYKE AI Client  
**Prepared by:** RYKE AI Development Team  
**Repository:** https://github.com/avancerasolution/ryke-ai  
**Estimated time:** 30–45 minutes  
**Upfront cost:** $0 (all services have free tiers to get started)

---

## Overview

RYKE AI requires four third-party services to operate. This document walks you through creating an account for each service, finding the correct settings page, and copying the API keys your development team needs.

| # | Service | Purpose | Cost |
|---|---------|---------|------|
| 1 | **Twilio** | Sends and receives SMS/MMS coaching messages | Free trial credit |
| 2 | **Anthropic (Claude)** | AI coaching engine — powers all conversations | Pay as you go |
| 3 | **SendBlue** | iMessage delivery to iPhone users | Free tier available |
| 4 | **Stripe** | Payment cards, free trial, and monthly billing | 2.9% + $0.30/transaction |

Once you have completed all four services, you will add the keys to your private GitHub repository (instructions at the end of this document).

---

## Step 1 — Twilio (SMS/MMS Messaging)

**URL:** https://www.twilio.com/try-twilio

Twilio sends and receives all coaching text messages. It handles both standard SMS (for Android and basic phones) and MMS (for food photo analysis).

### 1.1 Create your account

1. Go to https://www.twilio.com/try-twilio
2. Enter your name, email address, and a password
3. Verify your email address (check your inbox for a confirmation email)
4. Verify a mobile phone number when prompted — Twilio will send you a one-time code

> **Note:** Twilio gives you free trial credit when you sign up. No credit card is required to get started.

---

### 1.2 Get a phone number

1. After signing in, click **Phone Numbers** in the left sidebar
2. Click **Manage → Buy a number**
3. In the search filters, make sure both **SMS** and **MMS** checkboxes are ticked
4. Choose a phone number from the results and click **Buy**
5. Confirm the purchase — with your free trial credit this is at no charge

> **Important:** Make sure the number shows both SMS ✓ and MMS ✓ capability. Do not choose a number that only supports SMS.

---

### 1.3 Copy your credentials

Go to the Twilio Console home page (https://console.twilio.com). You will see your credentials on the dashboard.

| Key Name | Where to find it | Example format |
|----------|-----------------|----------------|
| `TWILIO_ACCOUNT_SID` | Printed on the dashboard under "Account SID" | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Click "show" next to "Auth Token" on the dashboard | 32-character string |
| `TWILIO_PHONE_NUMBER` | Phone Numbers → Manage → Active Numbers | `+15551234567` |

> **Security:** Keep your Auth Token private. Treat it like a password — do not share it via email or post it publicly.

---

### 1.4 Webhook URL (leave for now)

Go to **Phone Numbers → Manage → Active Numbers → click your number → Messaging Configuration**.

Leave the "A message comes in" webhook field blank for now. Your developer will fill in the correct URL after deployment. The format will be:

```
https://api.ryke.ai/v1/webhooks/sms
```

---

## Step 2 — Anthropic / Claude API (AI Engine)

**URL:** https://console.anthropic.com

Anthropic's Claude API is the AI brain behind RYKE AI. It powers all coaching conversations, food photo analysis, and the mental health safety system.

### 2.1 Create your account

1. Go to https://console.anthropic.com
2. Click **Sign Up** and register with your business email address
3. Verify your email address

---

### 2.2 Add billing

The Claude API requires a payment method before it will process requests.

1. In the left sidebar, click **Settings → Billing**
2. Click **Add payment method** and enter a credit card
3. Add an initial credit of at least **$10** to get started

> **Cost guidance:** RYKE AI uses Claude Haiku — the most efficient and affordable model. At 100 active users sending 10 messages per day, expect approximately **$7–$10/month** in Claude API costs. This is very low compared to Twilio SMS costs.

---

### 2.3 Create an API key

1. In the left sidebar, click **API Keys**
2. Click **Create Key**
3. Give the key a name, e.g. `RYKE AI Production`
4. Click **Create** — the key is shown **only once**
5. Copy it immediately and save it in a secure location (e.g. a password manager)

| Key Name | Where to find it | Example format |
|----------|-----------------|----------------|
| `ANTHROPIC_API_KEY` | Shown once at creation — copy immediately | `sk-ant-api03-...` |

> **Critical:** If you close the page without copying the key, it cannot be retrieved. You would need to create a new key. Save it to a password manager immediately.

---

## Step 3 — SendBlue (iMessage Delivery)

**URL:** https://sendblue.co

SendBlue delivers RYKE AI coaching messages as native iMessages (blue bubbles) to iPhone users. For all other users (Android, basic phones), messages automatically fall back to standard SMS through Twilio — no extra setup needed.

### 3.1 Create your account

1. Go to https://sendblue.co
2. Click **Get Started** or **Sign Up**
3. Complete the registration with your business email

---

### 3.2 Copy your API credentials

1. After signing in, go to the **Dashboard** or **Developer / API Keys** section
2. Copy both values below

| Key Name | Where to find it |
|----------|-----------------|
| `SENDBLUE_API_KEY_ID` | API Key ID — your public identifier |
| `SENDBLUE_API_SECRET_KEY` | API Secret Key — keep this private |

> **Note:** The `SENDBLUE_API_KEY_ID` is a public identifier, but the `SENDBLUE_API_SECRET_KEY` is a secret — treat it the same way as a password.

---

## Step 4 — Stripe (Payments & Subscriptions)

**URL:** https://dashboard.stripe.com/register

Stripe handles all payment processing for RYKE AI. It collects payment card details from new users, activates the 1-month free trial, and manages the monthly $20 subscription billing automatically.

> **Note:** Raw card numbers never touch the RYKE AI servers — Stripe handles all sensitive payment data.

### 4.1 Create your account

1. Go to https://dashboard.stripe.com/register
2. Register with your business email
3. You can start in **test mode** immediately — you do not need to complete business verification to get the keys needed for development

---

### 4.2 Create your subscription product

1. In the left sidebar go to **Product Catalogue**
2. Click **+ Add product**
3. Fill in the details:
   - **Name:** `RYKE AI Individual`
   - **Pricing model:** Recurring
   - **Price:** `$20.00`
   - **Billing period:** Monthly
4. Click **Save product**
5. On the product page, click on the price to expand it and copy the **Price ID**

| Key Name | Where to find it | Example format |
|----------|-----------------|----------------|
| `STRIPE_PRICE_ID_INDIVIDUAL` | Product page → Price ID | `price_1ABC123XYZdef` |

---

### 4.3 Get your API keys

1. In the left sidebar go to **Developers → API keys**
2. You will see two key types — use **test mode keys** for now (they start with `sk_test_`)
3. Copy the **Secret key** (click "Reveal test key" if needed)

| Key Name | Where to find it | Example format |
|----------|-----------------|----------------|
| `STRIPE_SECRET_KEY` | Developers → API Keys → Secret key | `sk_test_...` |

> **Security:** Only share the **secret key** with your developer. The "publishable key" is safe to use in browsers but the secret key must never be exposed publicly.

---

### 4.4 Create a webhook and get the signing secret

A webhook allows Stripe to notify RYKE AI when billing events happen (trial ending, payment failed, subscription cancelled, etc.).

1. Go to **Developers → Webhooks**
2. Click **+ Add endpoint**
3. For the **Endpoint URL**, enter a placeholder for now — your developer will update this after deployment:
   ```
   https://api.ryke.ai/v1/webhooks/stripe
   ```
4. Under **Select events to listen to**, tick the following six events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.trial_will_end`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
   - `invoice.payment_succeeded`
5. Click **Add endpoint**
6. On the webhook page, click **Reveal signing secret** and copy it

| Key Name | Where to find it | Example format |
|----------|-----------------|----------------|
| `STRIPE_WEBHOOK_SECRET` | Developers → Webhooks → your endpoint → Signing secret | `whsec_...` |

---

## Step 5 — Add Secrets to GitHub

Once you have collected all the keys above, add them to the private GitHub repository so the development pipeline can access them securely.

**URL:** https://github.com/avancerasolution/ryke-ai/settings/secrets/actions

### 5.1 Open the secrets page

1. Go to https://github.com/avancerasolution/ryke-ai
2. Click **Settings** (top menu bar of the repository)
3. In the left sidebar click **Secrets and variables → Actions**
4. Click **New repository secret**

---

### 5.2 Add each secret

For each row in the table below, click **New repository secret**, enter the exact **Name** shown, paste the **Value** you collected, and click **Add secret**.

| Secret Name | Collected from | Required |
|-------------|----------------|----------|
| `ANTHROPIC_API_KEY` | Anthropic Console → API Keys | ✅ Required |
| `TWILIO_ACCOUNT_SID` | Twilio Console → Dashboard | ✅ Required |
| `TWILIO_AUTH_TOKEN` | Twilio Console → Dashboard → Show | ✅ Required |
| `TWILIO_PHONE_NUMBER` | Twilio → Active Numbers | ✅ Required |
| `SENDBLUE_API_KEY_ID` | SendBlue Dashboard → API Keys | ✅ Required |
| `SENDBLUE_API_SECRET_KEY` | SendBlue Dashboard → API Keys | ✅ Required |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API Keys | ✅ Required |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks → Signing secret | ✅ Required |
| `STRIPE_PRICE_ID_INDIVIDUAL` | Stripe → Product Catalogue → Price ID | ✅ Required |

> **Note:** GitHub Secrets are encrypted and never displayed again after saving. If you make a mistake, simply create a new secret with the same name and it will overwrite the old one.

---

## Completion Checklist

Use this checklist before confirming setup is complete to your developer.

### Twilio
- [ ] Account created and email verified
- [ ] Phone number purchased (SMS + MMS enabled)
- [ ] `TWILIO_ACCOUNT_SID` copied and saved
- [ ] `TWILIO_AUTH_TOKEN` copied and saved
- [ ] `TWILIO_PHONE_NUMBER` noted in E.164 format (e.g. +15551234567)

### Anthropic
- [ ] Account created and email verified
- [ ] Billing credit added (minimum $10)
- [ ] API key created and saved securely
- [ ] `ANTHROPIC_API_KEY` copied (starts with `sk-ant-`)

### SendBlue
- [ ] Account created
- [ ] `SENDBLUE_API_KEY_ID` copied and saved
- [ ] `SENDBLUE_API_SECRET_KEY` copied and saved

### Stripe
- [ ] Account created
- [ ] Product "RYKE AI Individual" created at $20/month recurring
- [ ] `STRIPE_PRICE_ID_INDIVIDUAL` copied (starts with `price_`)
- [ ] `STRIPE_SECRET_KEY` copied (starts with `sk_test_` or `sk_live_`)
- [ ] Webhook created with all 6 events selected
- [ ] `STRIPE_WEBHOOK_SECRET` copied (starts with `whsec_`)

### GitHub
- [ ] All 9 secrets added to repository settings

---

## Questions?

If you get stuck at any step, contact your RYKE AI developer with a screenshot of the page you are on and a description of what you see. Do not send your API keys over email or chat — they should only be entered directly into GitHub Secrets.

---

*RYKE AI Client Setup Guide · Confidential · For internal use only*
