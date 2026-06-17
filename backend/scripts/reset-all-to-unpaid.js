/**
 * Plain-node twin of reset-all-to-unpaid.ts — for environments WITHOUT ts-node
 * (e.g. a Render production shell where devDependencies are pruned).
 *
 * Identical behaviour. It requires the COMPILED app from ../dist, so it only runs
 * after `nest build` has produced dist/ (true on any deployed Render service,
 * since the start command is `node dist/main`).
 *
 * One-off (DESTRUCTIVE): move EVERY `complete` user back to unpaid.
 *   1. Cancel their live Stripe subscription(s)  (skips beta `sub_beta_*` ids).
 *   2. Mark their local Subscription row(s) CANCELLED.
 *   3. Reset the user to onboarding_stage = 'payment_pending', status = cancelled,
 *      clearing payment_link_sent_at / sample_coaching_given / intake_link_stall_turns
 *      (name + goals stay saved, so they re-enter the pre-pay funnel cleanly).
 *   4. Send a one-time announcement SMS/iMessage.
 *
 * SAFETY: DRY RUN by default — only mutates / sends when APPLY=1.
 *
 * Usage (from backend/, with the prod env loaded — e.g. Render Shell):
 *   node scripts/reset-all-to-unpaid.js                       # dry run
 *   APPLY=1 LIMIT=3 node scripts/reset-all-to-unpaid.js       # rehearse on 3
 *   APPLY=1 node scripts/reset-all-to-unpaid.js               # full run
 *
 * Env knobs: APPLY=1 | LIMIT=N | SKIP_MESSAGE=1 | SLEEP_MS=600 | MESSAGE="..."
 */
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { Logger } = require('@nestjs/common');
const { Not } = require('typeorm');
const { getRepositoryToken } = require('@nestjs/typeorm');
const { AppModule } = require('../dist/app.module');
const { User, UserStatus, OnboardingStage } = require('../dist/data/entities/user.entity');
const { Subscription, SubscriptionStatus } = require('../dist/data/entities/subscription.entity');
const { StripeService } = require('../dist/onboarding/stripe.service');
const { MessagingService } = require('../dist/messaging/messaging.service');

const DEFAULT_MESSAGE =
  "hey, it's KIBA. quick heads up — we're updating our subscription plans, so your " +
  "account's set to unpaid for right now. nothing's lost: your goals and everything " +
  "we've talked about are still saved. whenever you wanna lock back in under the new " +
  "plan, just text me and i'll send you the link. 🔥";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const APPLY = process.env.APPLY === '1';
  const SKIP_MESSAGE = process.env.SKIP_MESSAGE === '1';
  const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : undefined;
  const SLEEP_MS = process.env.SLEEP_MS ? parseInt(process.env.SLEEP_MS, 10) : 600;
  const MESSAGE = process.env.MESSAGE || DEFAULT_MESSAGE;

  const log = new Logger('reset-all-to-unpaid');

  // Belt-and-suspenders: a real run needs BOTH APPLY=1 and CONFIRM=YES. Checked
  // before we even boot Nest / touch the DB so a stray APPLY=1 can't fire.
  if (APPLY && process.env.CONFIRM !== 'YES') {
    log.error(
      'APPLY=1 also requires CONFIRM=YES to actually mutate + send. Refusing. ' +
        'Run without APPLY for a dry run, or re-run with CONFIRM=YES when you mean it.',
    );
    process.exit(2);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: false });

  const stats = { users: 0, stripeCancelled: 0, stripeErrors: 0, localCancelled: 0, messaged: 0, messageErrors: 0, userErrors: 0 };

  try {
    const userRepo = app.get(getRepositoryToken(User));
    const subRepo = app.get(getRepositoryToken(Subscription));
    const stripe = app.get(StripeService);
    const messaging = app.get(MessagingService);

    const users = await userRepo.find({
      where: { onboarding_stage: OnboardingStage.COMPLETE },
      order: { registered_at: 'ASC' },
      ...(LIMIT ? { take: LIMIT } : {}),
    });

    const banner = APPLY
      ? `*** APPLY MODE — WILL MUTATE + ${SKIP_MESSAGE ? 'NOT SEND messages' : 'SEND messages'} ***`
      : 'DRY RUN — no changes, no sends';
    log.log(banner);
    log.log(`Found ${users.length} complete user(s)${LIMIT ? ` (LIMIT=${LIMIT})` : ''} to reset.`);
    if (!APPLY) log.log(`Announcement copy that WOULD be sent:\n  "${MESSAGE}"`);

    for (const user of users) {
      stats.users++;
      try {
        const subs = await subRepo.find({ where: { user_id: user.id } });
        const realActive = subs.filter(
          (s) =>
            s.status !== SubscriptionStatus.CANCELLED &&
            s.stripe_subscription_id &&
            !s.stripe_subscription_id.startsWith('sub_beta_'),
        );

        const desc =
          `${user.phone_number} (name=${user.name ?? 'none'}) — ` +
          `${subs.length} sub row(s), ${realActive.length} live Stripe sub(s)`;

        if (!APPLY) {
          log.log(`[DRY] would reset ${desc}`);
          continue;
        }

        // 1) Cancel live Stripe subscriptions.
        for (const s of realActive) {
          try {
            await stripe.cancelSubscription(s.stripe_subscription_id);
            stats.stripeCancelled++;
          } catch (err) {
            stats.stripeErrors++;
            log.warn(`Stripe cancel failed for ${user.phone_number} sub ${s.stripe_subscription_id}: ${err.message}`);
          }
        }

        // 2) Mark all local sub rows cancelled.
        const toCancel = subs.filter((s) => s.status !== SubscriptionStatus.CANCELLED);
        if (toCancel.length) {
          await subRepo.update(
            { user_id: user.id, status: Not(SubscriptionStatus.CANCELLED) },
            { status: SubscriptionStatus.CANCELLED },
          );
          stats.localCancelled += toCancel.length;
        }

        // 3) Reset the user back into the pre-pay funnel.
        await userRepo.update(user.id, {
          onboarding_stage: OnboardingStage.PAYMENT_PENDING,
          status: UserStatus.CANCELLED,
          payment_link_sent_at: null,
          sample_coaching_given: false,
          intake_link_stall_turns: 0,
        });

        // 4) Announcement.
        if (!SKIP_MESSAGE) {
          try {
            await messaging.send(user.phone_number, MESSAGE);
            stats.messaged++;
            await sleep(SLEEP_MS);
          } catch (err) {
            stats.messageErrors++;
            log.error(`Message failed for ${user.phone_number}: ${err.message}`);
          }
        }

        log.log(`reset ${desc}`);
      } catch (err) {
        stats.userErrors++;
        log.error(`Failed processing ${user.phone_number}: ${err.message}`);
      }
    }
  } finally {
    await app.close();
  }

  log.log(`Done. ${JSON.stringify(stats)}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
