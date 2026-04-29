import {
  Controller, Post, Headers, RawBodyRequest, Req,
  HttpCode, BadRequestException, Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { StripeService } from './stripe.service';
import { Subscription, SubscriptionStatus } from '../data/entities/subscription.entity';
import { User, UserStatus } from '../data/entities/user.entity';
import { ProcessedStripeEvent } from '../data/entities/processed-stripe-event.entity';
import { structuredLog } from '../common/logger';
import Stripe from 'stripe';

@Controller('webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripeService: StripeService,
    @InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(ProcessedStripeEvent) private readonly eventRepo: Repository<ProcessedStripeEvent>,
    @InjectQueue('messaging') private readonly messagingQueue: Queue,
  ) {}

  @Post('stripe')
  @HttpCode(200)
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException('Raw body unavailable — verify middleware order in main.ts');
    }

    let event: Stripe.Event;
    try {
      event = this.stripeService.constructWebhookEvent(req.rawBody, signature);
    } catch {
      throw new BadRequestException('Invalid Stripe signature');
    }

    // Idempotency: use INSERT with conflict detection (avoids TOCTOU race condition)
    try {
      await this.processEvent(event);
      await this.eventRepo.insert({ stripe_event_id: event.id, event_type: event.type });
    } catch (err) {
      // Unique constraint violation = already processed (concurrent delivery)
      if (err instanceof QueryFailedError && (err as any).code === '23505') {
        return { received: true };
      }
      this.logger.error(`Failed to process Stripe event ${event.id}: ${err}`);
      throw err;
    }

    return { received: true };
  }

  private async processEvent(event: Stripe.Event) {
    const data = event.data.object as any;

    switch (event.type) {
      case 'customer.subscription.created': {
        const sub = await this.subRepo.findOne({ where: { stripe_subscription_id: data.id } });
        if (sub) {
          sub.status = SubscriptionStatus.TRIALING;
          await this.subRepo.save(sub);
          const user = await this.userRepo.findOne({ where: { id: sub.user_id } });
          if (user) {
            await this.messagingQueue.add('send-message', {
              to: user.phone_number,
              body: `Your RYKE AI coaching is active! Text me anytime to start. 💪`,
              type: 'subscription_active',
            });
          }
        }
        break;
      }

      case 'customer.subscription.trial_will_end': {
        const sub = await this.subRepo.findOne({ where: { stripe_subscription_id: data.id } });
        if (sub) {
          const user = await this.userRepo.findOne({ where: { id: sub.user_id } });
          if (user) {
            await this.messagingQueue.add('send-message', {
              to: user.phone_number,
              body: `Your RYKE AI trial ends in 3 days. Your coaching continues automatically — no action needed!`,
              type: 'trial_ending',
            });
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = await this.subRepo.findOne({ where: { stripe_subscription_id: data.id } });
        if (sub) {
          const wasTrialing = sub.status === SubscriptionStatus.TRIALING;
          sub.status = data.status as SubscriptionStatus;
          if (data.current_period_end) sub.current_period_end = new Date(data.current_period_end * 1000);
          await this.subRepo.save(sub);
          if (wasTrialing && data.status === 'active') {
            const user = await this.userRepo.findOne({ where: { id: sub.user_id } });
            if (user) {
              await this.messagingQueue.add('send-message', {
                to: user.phone_number,
                body: `Your free trial has ended and your RYKE AI coaching continues. Welcome to the team! 🎉`,
                type: 'trial_ended',
              });
            }
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const sub = await this.subRepo.findOne({ where: { stripe_customer_id: data.customer } });
        if (sub) {
          sub.status = SubscriptionStatus.PAST_DUE;
          await this.subRepo.save(sub);
          const user = await this.userRepo.findOne({ where: { id: sub.user_id } });
          if (user) {
            await this.messagingQueue.add('send-message', {
              to: user.phone_number,
              body: `We couldn't process your RYKE AI payment. Please update your card to keep your coaching active.`,
              type: 'payment_failed',
            });
          }
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const sub = await this.subRepo.findOne({ where: { stripe_customer_id: data.customer } });
        if (sub && sub.status === SubscriptionStatus.PAST_DUE) {
          sub.status = SubscriptionStatus.ACTIVE;
          await this.subRepo.save(sub);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = await this.subRepo.findOne({ where: { stripe_subscription_id: data.id } });
        if (sub) {
          sub.status = SubscriptionStatus.CANCELLED;
          await this.subRepo.save(sub);
          const user = await this.userRepo.findOne({ where: { id: sub.user_id } });
          if (user) {
            user.status = UserStatus.CANCELLED;
            await this.userRepo.save(user);
            await this.messagingQueue.add('send-message', {
              to: user.phone_number,
              body: `Your RYKE AI subscription has ended. Text us any time to reactivate. Take care! 👋`,
              type: 'subscription_cancelled',
            });
          }
        }
        break;
      }
    }

    structuredLog(this.logger, 'log', { service: 'stripe-webhook', operation: event.type });
  }
}
