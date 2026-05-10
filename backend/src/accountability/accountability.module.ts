import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { DailyTask } from '../data/entities/daily-task.entity';
import { Proof } from '../data/entities/proof.entity';
import { Strike } from '../data/entities/strike.entity';
import { ExecutionScore } from '../data/entities/execution-score.entity';
import { AntiGhostState } from '../data/entities/anti-ghost-state.entity';
import { Goal } from '../data/entities/goal.entity';
import { User } from '../data/entities/user.entity';
import { ScoreService } from './score.service';
import { StrikeService } from './strike.service';
import { AntiGhostService } from './anti-ghost.service';
import { CheckinService } from './checkin.service';
import { CheckinProcessor } from './checkin.processor';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DailyTask, Proof, Strike, ExecutionScore, AntiGhostState, Goal, User]),
    BullModule.registerQueue({ name: 'accountability' }),
    MessagingModule,
  ],
  providers: [ScoreService, StrikeService, AntiGhostService, CheckinService, CheckinProcessor],
  exports: [ScoreService, StrikeService, AntiGhostService, CheckinService, CheckinProcessor],
})
export class AccountabilityModule {}
