import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { DataModule } from '../data/data.module';
import { MessagingModule } from '../messaging/messaging.module';
import { AiModule } from '../ai/ai.module';
import { SafetyService } from './safety.service';
import { SafetyProcessor } from './safety.processor';
import { SafetyController } from './safety.controller';

@Module({
  imports: [
    DataModule,
    MessagingModule,
    AiModule,
    BullModule.registerQueue({ name: 'crisis-detection' }),
  ],
  controllers: [SafetyController],
  providers: [SafetyService, SafetyProcessor],
  exports: [SafetyService],
})
export class SafetyModule {}
