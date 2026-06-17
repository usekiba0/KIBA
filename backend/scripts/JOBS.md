# One-off Jobs (Render)

Render runs a **one-off Job** as a command inside the existing service's latest
deploy/image, with all the service's env vars (prod `DATABASE_URL`, `STRIPE_*`,
`SENDBLUE_*`/`TWILIO_*`) already loaded. Trigger it from the service's **Jobs**
tab in the dashboard, or with the Render CLI. Nothing to schedule — it runs once.

> Jobs run in the **service root** (the `backend/` directory, where `package.json`
> lives), so the `npm run …` commands below work as-is. They require the compiled
> `dist/` (always present on a deployed service — the start command is `node dist/main`).

## reset-all-to-unpaid — move every `complete` user back to unpaid

Cancels each complete user's live Stripe sub, marks local sub rows cancelled,
resets them to `payment_pending` (name + goals kept), and texts a one-time
"we're updating the subscription plans" announcement. **DRY RUN unless `APPLY=1`.**

Dashboard → backend service → **Jobs** → New Job → set the command:

```
# 1) Dry run — changes nothing, prints the affected count + the copy:
npm run job:reset-unpaid

# 2) Rehearse on 3 (real changes, limited):
LIMIT=3 npm run job:reset-unpaid:apply

# 3) Full run:
npm run job:reset-unpaid:apply
```

Optional env (add as the job's env vars, or inline): `LIMIT=N`, `SKIP_MESSAGE=1`,
`SLEEP_MS=600`, `MESSAGE="custom copy"`.

Render CLI equivalent (replace `srv-…` with the backend service id):

```
render jobs create --service srv-XXXXXXXX --start-command "npm run job:reset-unpaid"
render jobs create --service srv-XXXXXXXX --start-command "npm run job:reset-unpaid:apply"
```

**Always run the dry run first** — its printed count is exactly how many people
get the text and a cancelled Stripe subscription.
