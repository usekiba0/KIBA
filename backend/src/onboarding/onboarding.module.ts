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
  ],
  controllers: [OnboardingController, StripeWebhookController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
