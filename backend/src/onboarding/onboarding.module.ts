import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { DataModule } from '../data/data.module';
import { MessagingModule } from '../messaging/messaging.module';
import { AccountabilityModule } from '../accountability/accountability.module';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

@Module({
  imports: [
    DataModule,
    MessagingModule,
    forwardRef(() => AccountabilityModule),
    BullModule.registerQueue({ name: 'messaging' }),
    // The webhook schedules the day-7 price reveal on the accountability queue
    // (CheckinProcessor handles it). Registering the same queue name here makes
    // the token injectable in this module's scope — same pattern as 'messaging'.
    BullModule.registerQueue({ name: 'accountability' }),
  ],
  controllers: [OnboardingController, StripeWebhookController, CheckoutController],
  // CheckoutService stays local to this module. CoachingProcessor mints links
  // via the dependency-free helpers in checkout-link.ts instead of injecting
  // this service — sharing a provider across MessagingModule and
  // OnboardingModule (which already import each other) blew the Nest injector's
  // stack.
  providers: [OnboardingService, CheckoutService],
})
export class OnboardingModule {}
