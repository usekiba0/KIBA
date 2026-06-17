/**
 * One-off (DESTRUCTIVE): move EVERY `complete` user back to unpaid.
 *
 * For each user whose onboarding_stage = 'complete':
 *   1. Cancel their real Stripe subscription(s)  (skips beta `sub_beta_*` ids).
 *   2. Mark their local Subscription row(s) CANCELLED.
 *   3. Reset the user to onboarding_stage = 'payment_pending', status = cancelled,
 *      and clear payment_link_sent_at / sample_coaching_given / intake_link_stall_turns
 *      so they re-enter the pre-pay funnel cleanly (name + goals stay saved).
 *   4. Send a one-time announcement SMS/iMessage.
 *
 * Why payment_pending (not intake): they already gave us name + goals during
 * onboarding — bouncing them to "what's your name?" would be a worse experience.
 * payment_pending keeps the profile and just puts them behind the paywall.
 *
 * SAFETY:
 *   - DRY RUN by default. It only mutates / sends when APPLY=1 is set.
 *   - In dry run it prints exactly what it WOULD do, plus the affected count.
 *   - Per-user try/catch: one failure never aborts the batch; errors are tallied.
 *
 * Usage (from backend/, with the prod .env loaded):
 *   # 1) see what it would touch — changes NOTHING:
 *   npx ts-node scripts/reset-all-to-unpaid.ts
 *   # 2) optional: rehearse on a few:
 *   APPLY=1 LIMIT=3 npx ts-node scripts/reset-all-to-unpaid.ts
 *   # 3) full run:
 *   APPLY=1 npx ts-node scripts/reset-all-to-unpaid.ts
 *
 * Env knobs:
 *   APPLY=1        actually mutate + send (otherwise dry run)
 *   LIMIT=N        only process the first N complete users (testing)
 *   SKIP_MESSAGE=1 do the state changes but DON'T send the announcement
 *   SLEEP_MS=600   throttle between sends (default 600ms)
 *   MESSAGE="..."  override the announcement copy
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Repository, Not } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppModule } from '../src/app.module';
import { User, UserStatus, OnboardingStage } from '../src/data/entities/user.entity';
import { Subscription, SubscriptionStatus } from '../src/data/entities/subscription.entity';
import { StripeService } from '../src/onboarding/stripe.service';
import { MessagingService } from '../src/messaging/messaging.service';

const DEFAULT_MESSAGE =
  "hey, it's KIBA. quick heads up — we're updating our subscription plans, so your " +
  "account's set to unpaid for right now. nothing's lost: your goals and everything " +
  "we've talked about are still saved. whenever you wanna lock back in under the new " +
  "plan, just text me and i'll send you the link. 🔥";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const APPLY = process.env.APPLY === '1';
  const SKIP_MESSAGE = process.env.SKIP_MESSAGE === '1';
  const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : undefined;
  const SLEEP_MS = process.env.SLEEP_MS ? parseInt(process.env.SLEEP_MS, 10) : 600;
  const MESSAGE = process.env.MESSAGE || DEFAULT_MESSAGE;

  const log = new Logger('reset-all-to-unpaid');
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: false });

  const stats = { users: 0, stripeCancelled: 0, stripeErrors: 0, localCancelled: 0, messaged: 0, messageErrors: 0, userErrors: 0 };

  try {
    const userRepo = app.get<Repository<User>>(getRepositoryToken(User));
    const subRepo = app.get<Repository<Subscription>>(getRepositoryToken(Subscription));
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
            log.warn(`Stripe cancel failed for ${user.phone_number} sub ${s.stripe_subscription_id}: ${(err as Error).message}`);
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
            log.error(`Message failed for ${user.phone_number}: ${(err as Error).message}`);
          }
        }

        log.log(`reset ${desc}`);
      } catch (err) {
        stats.userErrors++;
        log.error(`Failed processing ${user.phone_number}: ${(err as Error).message}`);
      }
    }
  } finally {
    await app.close();
  }

  log.log(`Done. ${JSON.stringify(stats)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
