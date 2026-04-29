# Quickstart: RYKE AI MVP Phase 1

**Branch**: `001-sms-ai-coaching` | **Date**: 2026-04-29

Get the full stack running locally in under 10 minutes.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20 LTS | https://nodejs.org |
| Docker Desktop | Latest | https://docker.com |
| Twilio Account | — | https://console.twilio.com |
| Stripe Account | — | https://dashboard.stripe.com |
| Anthropic API Key | — | https://console.anthropic.com |
| ngrok (for webhooks) | Latest | https://ngrok.com |

---

## 1. Clone and Install

```bash
git clone <repo-url>
cd rykeai
git checkout 001-sms-ai-coaching

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

---

## 2. Start Infrastructure (PostgreSQL + Redis)

```bash
cd backend
docker-compose up -d
```

**docker-compose.yml** (backend/):
```yaml
version: "3.9"
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: rykeai
      POSTGRES_USER: rykeai
      POSTGRES_PASSWORD: rykeai_local
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

---

## 3. Configure Environment Variables

```bash
cp backend/.env.example backend/.env
```

Fill in `backend/.env`:

```env
# App
NODE_ENV=development
PORT=3000
SESSION_TIMEOUT_HOURS=4

# Database
DATABASE_URL=postgresql://rykeai:rykeai_local@localhost:5432/rykeai

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+15550001234

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_ID_INDIVIDUAL=price_xxx        # $20/mo plan
STRIPE_TRIAL_DAYS=30

# Anthropic (Claude)
ANTHROPIC_API_KEY=sk-ant-xxx
AI_MODEL=claude-haiku-4-5-20251001          # Override with claude-sonnet-4-6 for higher accuracy
CRISIS_CONFIDENCE_THRESHOLD=0.65
CRISIS_COACH_ALERT_EMAIL=coach@ryke.ai
CRISIS_COACH_ALERT_PHONE=+15550009999

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3000/v1
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
```

---

## 4. Run Database Migrations

```bash
cd backend
npm run migration:run
```

---

## 5. Start the Backend

```bash
cd backend
npm run start:dev
```

Backend runs at `http://localhost:3000`

---

## 6. Start the Frontend

```bash
cd frontend
npm run dev
```

Frontend runs at `http://localhost:3001`

---

## 7. Expose Webhooks with ngrok

Twilio and Stripe need a public URL to send webhooks locally.

```bash
ngrok http 3000
```

Copy the HTTPS URL (e.g. `https://abc123.ngrok.io`) and configure:

**Twilio Console** → Phone Numbers → Your Number → Messaging:
- Webhook URL: `https://abc123.ngrok.io/v1/webhooks/sms`
- Method: `HTTP POST`

**Stripe Dashboard** → Developers → Webhooks → Add endpoint:
- URL: `https://abc123.ngrok.io/v1/webhooks/stripe`
- Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.trial_will_end`, `invoice.payment_failed`, `invoice.payment_succeeded`, `customer.subscription.deleted`
- Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`

---

## 8. Test the Full Onboarding Flow

1. Open `http://localhost:3001`
2. Complete the onboarding form (use Stripe test card `4242 4242 4242 4242`, any future expiry)
3. Submit — welcome SMS should arrive on your phone within 30 seconds
4. Reply to the SMS — the AI coach should respond within 10 seconds

---

## 9. Test Crisis Detection

Send this SMS from your registered phone to the Twilio number:

```
I've been feeling really hopeless lately and don't see the point anymore
```

Expected behaviour:
- Holding message received within 3 seconds
- Coach alert email/SMS sent within 5 minutes
- AI coaching suspended until alert resolved

---

## 10. Test MMS Nutrition Analysis

Send a food photo as MMS to the Twilio number.

Expected behaviour:
- Nutritional breakdown (calories, macros) returned within 15 seconds
- Response accounts for any health conditions in your onboarding profile

---

## Key API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/onboarding/setup-intent` | POST | Create Stripe SetupIntent |
| `/v1/onboarding/submit` | POST | Complete onboarding + start trial |
| `/v1/webhooks/sms` | POST | Twilio inbound webhook |
| `/v1/webhooks/stripe` | POST | Stripe billing webhook |

---

## Running Tests

```bash
cd backend

# Unit tests
npm run test

# Integration tests (requires running Docker infra)
npm run test:integration

# Contract tests
npm run test:contract

# All tests with coverage
npm run test:cov
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Welcome SMS not arriving | Check `TWILIO_PHONE_NUMBER` is correct E.164; check ngrok is running; check BullMQ queue logs |
| Stripe webhook 400 | Ensure `rawBody: true` in `main.ts`; re-copy `STRIPE_WEBHOOK_SECRET` from dashboard |
| Claude API errors | Verify `ANTHROPIC_API_KEY`; check model name matches `AI_MODEL` env var |
| Redis connection refused | Run `docker-compose up -d`; check port 6379 not in use |
| Twilio signature invalid | Ensure `express.urlencoded({ extended: false })` is registered; check ngrok URL matches Twilio console |
