/**
 * One-off: send a Stripe checkout link via SMS to a specific user, bypassing
 * the regular intake/coaching flow. Used to recover a user who asked to pay
 * but got refused by the coaching AI before the billing-intent guard shipped.
 *
 * Usage (from backend/):
 *   USER_ID=ba2b8110-dcf4-4a99-9680-80f7b0b9b05e npx ts-node scripts/manual-send-link.ts
 *
 * Reads the same .env Nest reads. Honours the same sendPaymentLink semantics
 * (resets payment_link_sent_at, schedules dunning) but with requireFullIntake
 * disabled so legacy users without intake_data.goal_description still get served.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppModule } from '../src/app.module';
import { CoachingProcessor } from '../src/messaging/coaching.processor';
import { User } from '../src/data/entities/user.entity';
import { Subscription, SubscriptionStatus } from '../src/data/entities/subscription.entity';

async function main() {
  const userId = process.env.USER_ID;
  if (!userId) {
    console.error('USER_ID env var is required.');
    process.exit(2);
  }

  const log = new Logger('manual-send-link');
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: false });

  try {
    const userRepo = app.get<Repository<User>>(getRepositoryToken(User));
    const subRepo = app.get<Repository<Subscription>>(getRepositoryToken(Subscription));
    const processor = app.get(CoachingProcessor);

    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) {
      log.error(`No user with id ${userId}`);
      process.exit(3);
    }
    log.log(`Found ${user.phone_number} (name=${user.name ?? 'none'}, stage=${user.onboarding_stage})`);

    const activeSub = await subRepo.findOne({
      where: [
        { user_id: user.id, status: SubscriptionStatus.ACTIVE },
        { user_id: user.id, status: SubscriptionStatus.TRIALING },
      ],
    });
    if (activeSub) {
      log.warn(`User already has ${activeSub.status} subscription ${activeSub.stripe_subscription_id}. Aborting — refusing to charge twice.`);
      process.exit(4);
    }

    // Bypass intake-completeness check; we just want them paying.
    // `sendPaymentLink` is private — bracket-access escape hatch for an
    // out-of-band recovery script.
    const result = await (processor as unknown as {
      sendPaymentLink: (u: User, msgId: string, opts: { requireFullIntake: boolean })
        => Promise<{ ok: true; checkout_url: string } | { ok: false; error: string }>;
    }).sendPaymentLink(user, 'manual-hotfix-script', { requireFullIntake: false });

    if (result.ok) {
      log.log(`Sent. Stripe checkout URL: ${result.checkout_url}`);
    } else {
      log.error(`Failed: ${result.error}`);
      process.exit(5);
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
