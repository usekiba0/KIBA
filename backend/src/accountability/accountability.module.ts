import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { DailyTask } from '../data/entities/daily-task.entity';
import { Proof } from '../data/entities/proof.entity';
import { Strike } from '../data/entities/strike.entity';
import { ExecutionScore } from '../data/entities/execution-score.entity';
import { AntiGhostState } from '../data/entities/anti-ghost-state.entity';
import { Goal } from '../data/entities/goal.entity';
import { ScoreService } from './score.service';
import { StrikeService } from './strike.service';
import { AntiGhostService } from './anti-ghost.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DailyTask, Proof, Strike, ExecutionScore, AntiGhostState, Goal]),
    BullModule.registerQueue({ name: 'accountability' }),
  ],
  providers: [ScoreService, StrikeService, AntiGhostService],
  exports: [ScoreService, StrikeService, AntiGhostService],
})
export class AccountabilityModule {}
