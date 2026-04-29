import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { DataModule } from '../data/data.module';
import { AiModule } from '../ai/ai.module';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { MessagingProcessor } from './messaging.processor';
import { CoachingProcessor } from './coaching.processor';
import { TwilioWebhookGuard } from './guards/twilio-webhook.guard';
import { SendBlueWebhookGuard } from './guards/sendblue-webhook.guard';

@Module({
  imports: [
    DataModule,
    AiModule,
    BullModule.registerQueue(
      { name: 'messaging' },
      { name: 'coaching' },
      { name: 'crisis-detection' },
    ),
  ],
  controllers: [MessagingController],
  providers: [
    MessagingService, MessagingProcessor, CoachingProcessor,
    TwilioWebhookGuard, SendBlueWebhookGuard,
  ],
  exports: [MessagingService, BullModule],
})
export class MessagingModule {}
