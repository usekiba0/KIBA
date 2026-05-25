import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { DailyTask } from '../data/entities/daily-task.entity';
import { Proof } from '../data/entities/proof.entity';
import { Strike } from '../data/entities/strike.entity';
import { ExecutionScore } from '../data/entities/execution-score.entity';
import { AntiGhostState } from '../data/entities/anti-ghost-state.entity';
import { Goal } from '../data/entities/goal.entity';
import { User } from '../data/entities/user.entity';
import { PsychologicalProfile } from '../data/entities/psychological-profile.entity';
import { ScheduledReminder } from '../data/entities/scheduled-reminder.entity';
import { ScoreService } from './score.service';
import { ScheduleService } from './schedule.service';
import { StrikeService } from './strike.service';
import { AntiGhostService } from './anti-ghost.service';
import { CheckinService } from './checkin.service';
import { CheckinProcessor } from './checkin.processor';
import { MessageRouterService } from './message-router.service';
import { ProofService } from './proof.service';
import { PlanAdjustmentService } from './plan-adjustment.service';
import { TaskService } from './task.service';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DailyTask, Proof, Strike, ExecutionScore, AntiGhostState, Goal, User, PsychologicalProfile, ScheduledReminder]),
    BullModule.registerQueue({ name: 'accountability' }),
    forwardRef(() => MessagingModule),
  ],
  providers: [ScoreService, StrikeService, AntiGhostService, CheckinService, CheckinProcessor, MessageRouterService, ProofService, PlanAdjustmentService, ScheduleService, TaskService],
  exports: [ScoreService, StrikeService, AntiGhostService, CheckinService, CheckinProcessor, MessageRouterService, ProofService, PlanAdjustmentService, ScheduleService, TaskService],
})
export class AccountabilityModule {}
