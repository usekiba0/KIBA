# Client Setup Guide
## SMS AI Coaching Platform — New Project Onboarding

---

## Before You Start

Create a dedicated Gmail account for this project before signing up for anything.

- Go to gmail.com → Create account
- Use a name like `clientname.app@gmail.com`
- Use this email for every service below — keeps everything organised in one place

---

## Accounts to Create

### 1. GitHub
**What it's for:** Stores the code and triggers automatic deployments.

**Steps:**
1. Go to github.com → Sign Up
2. Verify your email
3. Create a new **private repository** for the project
4. Share the repository link with your developer

**Plan:** Free

---

### 2. Anthropic (AI)
**What it's for:** Powers the AI coaching responses via Claude.

**Steps:**
1. Go to console.anthropic.com → Sign Up
2. Verify your email
3. Go to **Billing** in the left sidebar
4. Add a credit card
5. Add a minimum of **$20 in credits** — the AI will not work without this
6. Share account access with your developer

**Plan:** Pay-as-you-go (no monthly fee, charged per message)
**Estimated cost:** $2–5/month at low volume

---

### 3. Twilio (SMS)
**What it's for:** Sends and receives SMS messages to your users.

**Steps:**
1. Go to twilio.com → Sign Up
2. Verify your email and phone number
3. **Upgrade from trial immediately:**
   - Go to **Billing** → Upgrade Account
   - Add a credit card
   - Add a minimum of **$20** to your balance
   - Trial accounts can only text verified numbers and add a prefix to every message — not suitable for real users
4. Buy a phone number:
   - Go to **Phone Numbers → Manage → Buy a Number**
   - Select a US number (~$1.15/month)
   - Click Buy
5. Enable countries your users are in:
   - Go to **Messaging → Settings → Geo Permissions**
   - Enable the countries your users will be texting from

**Plan:** Pay-as-you-go
**Estimated cost:** $3–5/month (number + messages)

---

### 4. Stripe (Payments)
**What it's for:** Handles subscription payments and free trials from your users.

**Steps:**
1. Go to stripe.com → Create Account
2. Verify your email
3. The account starts in **test mode** — this is fine during development
4. Create a subscription product:
   - Go to **Product Catalog → Add Product**
   - Add a name (e.g. "Monthly Coaching Plan")
   - Add a recurring monthly price
   - Save the product
5. When ready to accept real payments:
   - Go to **Settings → Activate Account**
   - Fill in your business details (name, address, bank account)
   - Approval takes 1–2 business days

**Plan:** Free (Stripe takes 2.9% + $0.30 per transaction — no monthly fee)

---

### 5. Upstash (Redis)
**What it's for:** Manages the message queue so coaching replies are sent reliably in the background.

**Steps:**
1. Go to upstash.com → Sign Up
2. Verify your email
3. Click **Create Database**
4. Select **Redis**
5. Choose the region closest to your users (e.g. US-East-1 for US users)
6. Click Create
7. Share account access with your developer

**Plan:** Free (10,000 requests/day included — sufficient for most clients)

---

### 6. Render — Backend + Database
**What it's for:** Hosts the backend server and the database.

> **Important:** Render is where both your server and your database live. Both need the paid Starter plan — the free tier sleeps after inactivity (breaks SMS) and deletes the database after 90 days.

**Steps — Backend Server:**
1. Go to render.com → Sign Up
2. Connect your GitHub account
3. Click **New → Web Service**
4. Select the project repository
5. Set the root directory to `backend`
6. Select the **Starter plan ($7/month)**
7. Click Create Web Service

**Steps — PostgreSQL Database:**
1. In Render dashboard → Click **New → PostgreSQL**
2. Give it a name (e.g. `clientname-db`)
3. Select the **Starter plan ($7/month)**
4. Choose the same region as your web service
5. Click Create Database

**Plan:** Starter — $7/month per service
**Total Render cost:** $14/month (backend + database)

---

### 7. Vercel (Frontend Website)
**What it's for:** Hosts the sign-up and onboarding website your users visit.

**Steps:**
1. Go to vercel.com → Sign Up
2. Connect your GitHub account
3. Click **Add New → Project**
4. Import the project repository
5. Set the root directory to `frontend`
6. Click Deploy

**Plan:** Free (Hobby plan)

---

## Summary — Monthly Costs

| Service | Plan | Monthly Cost |
|---------|------|-------------|
| Render — Backend | Starter | $7.00 |
| Render — Database | Starter | $7.00 |
| Twilio | Pay-as-you-go | ~$3–5 |
| Anthropic | Pay-as-you-go | ~$2–5 |
| Upstash | Free | $0 |
| Vercel | Free | $0 |
| GitHub | Free | $0 |
| Stripe | % per transaction | $0 fixed |
| **Total** | | **~$19–24/month** |

Variable costs (Twilio + Anthropic) scale with the number of active users. Expect roughly **$0.03–0.05 per user per month** at low volume.

---

## Handover to Developer

Once all accounts are created, share the following with your developer:
- Login access (or invite them as a team member) on: Render, Vercel, GitHub, Twilio, Stripe, Anthropic, Upstash
- The phone number you purchased on Twilio
- The subscription price ID from Stripe
- The Gmail account credentials used for all signups
