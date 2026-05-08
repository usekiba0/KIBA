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
import { PsychologicalProfile } from './entities/psychological-profile.entity';
import { Goal } from './entities/goal.entity';
import { DailyTask } from './entities/daily-task.entity';
import { Proof } from './entities/proof.entity';
import { Strike } from './entities/strike.entity';
import { ExecutionScore } from './entities/execution-score.entity';
import { AntiGhostState } from './entities/anti-ghost-state.entity';
import { SessionCacheService } from './session-cache.service';
import { SessionBoundaryService } from './session-boundary.service';
import { DataRightsService } from './data-rights.service';
import { DataRightsController } from './data-rights.controller';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { StripeService } from '../onboarding/stripe.service';

const ENTITIES = [
  User,
  Subscription,
  ConversationSession,
  Message,
  NutritionalAnalysis,
  CrisisAlert,
  SessionSummary,
  ProcessedStripeEvent,
  PsychologicalProfile,
  Goal,
  DailyTask,
  Proof,
  Strike,
  ExecutionScore,
  AntiGhostState,
];

@Module({
  imports: [
    TypeOrmModule.forFeature(ENTITIES),
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'single',
        url:
          config.get<string>('REDIS_URL') ||
          `redis://${config.get('REDIS_HOST', 'localhost')}:${config.get('REDIS_PORT', 6379)}`,
      }),
    }),
  ],
  controllers: [DataRightsController, AdminController],
  providers: [SessionCacheService, SessionBoundaryService, DataRightsService, AdminService, StripeService],
  exports: [TypeOrmModule, SessionCacheService, SessionBoundaryService, RedisModule, StripeService],
})
export class DataModule {}
