import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { DataModule } from '../data/data.module';
import { AiModule } from '../ai/ai.module';
import { SafetyModule } from '../safety/safety.module';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { MessagingProcessor } from './messaging.processor';
import { CoachingProcessor } from './coaching.processor';
import { TwilioWebhookGuard } from './guards/twilio-webhook.guard';
import { SendBlueWebhookGuard } from './guards/sendblue-webhook.guard';
import { ScoreIntentService } from '../accountability/score-intent.service';

@Module({
  imports: [
    DataModule,
    AiModule,
    forwardRef(() => SafetyModule),
    BullModule.registerQueue(
      { name: 'messaging' },
      { name: 'coaching' },
      { name: 'crisis-detection' },
    ),
  ],
  controllers: [MessagingController],
  providers: [
    MessagingService, MessagingProcessor, CoachingProcessor,
    TwilioWebhookGuard, SendBlueWebhookGuard, ScoreIntentService,
  ],
  exports: [MessagingService, BullModule, ScoreIntentService],
})
export class MessagingModule {}
