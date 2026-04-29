import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '@nestjs-modules/ioredis';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from './entities/user.entity';
import { Subscription } from './entities/subscription.entity';
import { ConversationSession } from './entities/conversation-session.entity';
import { Message } from './entities/message.entity';
import { NutritionalAnalysis } from './entities/nutritional-analysis.entity';
import { CrisisAlert } from './entities/crisis-alert.entity';
import { SessionSummary } from './entities/session-summary.entity';
import { ProcessedStripeEvent } from './entities/processed-stripe-event.entity';
import { SessionCacheService } from './session-cache.service';
import { SessionBoundaryService } from './session-boundary.service';
import { DataRightsService } from './data-rights.service';
import { DataRightsController } from './data-rights.controller';

const ENTITIES = [
  User, Subscription, ConversationSession, Message,
  NutritionalAnalysis, CrisisAlert, SessionSummary, ProcessedStripeEvent,
];

@Module({
  imports: [
    TypeOrmModule.forFeature(ENTITIES),
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'single',
        url: `redis://${config.get('REDIS_HOST', 'localhost')}:${config.get('REDIS_PORT', 6379)}`,
      }),
    }),
  ],
  controllers: [DataRightsController],
  providers: [SessionCacheService, SessionBoundaryService, DataRightsService],
  exports: [TypeOrmModule, SessionCacheService, SessionBoundaryService, RedisModule],
})
export class DataModule {}
