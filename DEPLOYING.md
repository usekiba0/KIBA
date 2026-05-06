# Deployment Protocol

## Branch → Environment Map

| Branch | Environment | Auto-deploys to |
|--------|-------------|-----------------|
| `master` | Production | Render (backend) + Vercel (frontend) |
| `001-sms-ai-coaching` | Legacy — do not use for new work | — |

**Rule:** All commits go to `master`. Never push fixes directly to feature branches.

---

## One-Time Platform Setup (do this once)

### Render — set branch to master
1. Render dashboard → your backend service → **Settings**
2. **Branch** → change from `001-sms-ai-coaching` to `master`
3. Save → Manual Deploy → Deploy latest commit

### Vercel — confirm branch is master
1. Vercel dashboard → your project → **Settings → Git**
2. **Production Branch** → must be `master`
3. If wrong, change it and redeploy

### GitHub — confirm CI runs on master
Already configured in `.github/workflows/ci.yml` — runs on push to `master`.

---

## Every Deploy Checklist

```
[ ] Commit and push to master
[ ] GitHub Actions CI passes (check Actions tab)
[ ] Render shows "Your service is live" in logs (takes 3–6 min)
[ ] Vercel shows deployment "Ready" (takes 1–2 min)
[ ] Run verify script: bash scripts/verify-deploy.sh
```

---

## Verify Script

Run after every deploy to confirm all environments are in sync:

```bash
bash scripts/verify-deploy.sh
```

What it checks:
- Backend health endpoint responds 200
- CORS allows PATCH (needed for admin block/unblock, flag, resolve)
- New endpoints exist (detects stale deploys)
- Frontend is reachable

---

## If Render Won't Auto-Deploy

Go to **Render dashboard → your backend service → Manual Deploy → Deploy latest commit**.

If that fails, check **Render → Events** for build errors.

Common build failure causes:
- TypeScript compile error → check `npm run build` locally first
- Missing env var → check Render environment variables

---

## Environment Variables

### Render (backend) — full list
```
NODE_ENV=production
BETA_MODE=false
PORT=3000
APP_BASE_URL=https://rykeai-backend.onrender.com
FRONTEND_URL=https://ryke-ai.vercel.app
SESSION_TIMEOUT_HOURS=4
INTERNAL_API_KEY=<32+ char secret>

DATABASE_URL=<Render PostgreSQL URL>
REDIS_URL=<Upstash Redis URL>

TWILIO_ACCOUNT_SID=<from Twilio>
TWILIO_AUTH_TOKEN=<from Twilio>
TWILIO_PHONE_NUMBER=<from Twilio>

SENDBLUE_API_KEY_ID=<from SendBlue>
SENDBLUE_API_SECRET_KEY=<from SendBlue>

STRIPE_SECRET_KEY=<sk_test_... or sk_live_...>
STRIPE_WEBHOOK_SECRET=<whsec_...>
STRIPE_PRICE_ID_INDIVIDUAL=<price_...>
STRIPE_TRIAL_DAYS=30

ANTHROPIC_API_KEY=<sk-ant-...>
AI_MODEL=claude-haiku-4-5-20251001

CRISIS_CONFIDENCE_THRESHOLD=0.65
CRISIS_COACH_ALERT_EMAIL=<coach email>
CRISIS_COACH_ALERT_PHONE=<coach phone in E.164>

SMTP_HOST=<smtp host>
SMTP_PORT=587
SMTP_USER=<smtp user>
SMTP_PASS=<smtp password>
SMTP_FROM=RYKE AI Alerts <alerts@ryke.ai>
```

### Vercel (frontend) — full list
```
NEXT_PUBLIC_API_URL=https://rykeai-backend.onrender.com/v1
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<pk_test_... or pk_live_...>
```

---

## Going Live Checklist (when switching to real payments)

```
[ ] Render: STRIPE_SECRET_KEY → switch to sk_live_...
[ ] Render: STRIPE_WEBHOOK_SECRET → switch to live whsec_...
[ ] Render: STRIPE_PRICE_ID_INDIVIDUAL → switch to live price_...
[ ] Vercel: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY → switch to pk_live_...
[ ] Stripe dashboard: activate account (fill in business details)
[ ] Twilio: ensure geo permissions enabled for target countries
[ ] CRISIS_COACH_ALERT_PHONE → real coach phone number
[ ] CRISIS_COACH_ALERT_EMAIL → real coach email
[ ] SMTP credentials → real email provider (Resend / SendGrid)
```
