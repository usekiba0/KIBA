import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { DailyTask } from '../data/entities/daily-task.entity';
import { DailyTodo } from '../data/entities/daily-todo.entity';
import { Proof } from '../data/entities/proof.entity';
import { Strike } from '../data/entities/strike.entity';
import { ExecutionScore } from '../data/entities/execution-score.entity';
import { AntiGhostState } from '../data/entities/anti-ghost-state.entity';
import { Goal } from '../data/entities/goal.entity';
import { User } from '../data/entities/user.entity';
import { PsychologicalProfile } from '../data/entities/psychological-profile.entity';
import { ScheduledReminder } from '../data/entities/scheduled-reminder.entity';
// Message + ConversationSession are owned by DataModule, but CheckinProcessor
// needs MessageRepository (to write is_checkin_prompt rows) and DataModule
// provides SessionBoundaryService. We import DataModule via forwardRef to break
// the cycle (DataModule already forwardRef-imports AccountabilityModule).
import { Message } from '../data/entities/message.entity';
import { ConversationSession } from '../data/entities/conversation-session.entity';
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
import { TodoService } from './todo.service';
import { SurpriseService } from './surprise.service';
import { RecapService } from './recap.service';
import { MessagingModule } from '../messaging/messaging.module';
import { DataModule } from '../data/data.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DailyTask, DailyTodo, Proof, Strike, ExecutionScore, AntiGhostState,
      Goal, User, PsychologicalProfile, ScheduledReminder,
      Message, ConversationSession,
    ]),
    BullModule.registerQueue({ name: 'accountability' }),
    forwardRef(() => MessagingModule),
    forwardRef(() => DataModule),
  ],
  providers: [ScoreService, StrikeService, AntiGhostService, CheckinService, CheckinProcessor, MessageRouterService, ProofService, PlanAdjustmentService, ScheduleService, TaskService, TodoService, SurpriseService, RecapService],
  exports: [ScoreService, StrikeService, AntiGhostService, CheckinService, CheckinProcessor, MessageRouterService, ProofService, PlanAdjustmentService, ScheduleService, TaskService, TodoService, SurpriseService, RecapService],
})
export class AccountabilityModule {}
