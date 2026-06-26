import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { DataModule } from '../data/data.module';
import { MessagingModule } from '../messaging/messaging.module';
import { AccountabilityModule } from '../accountability/accountability.module';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';
import { StripeWebhookController } from './stripe-webhook.controller';

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
  controllers: [OnboardingController, StripeWebhookController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
