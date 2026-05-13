import { Module } from '@nestjs/common';
import { DataModule } from '../data/data.module';
import { CoachingService } from './coaching.service';
import { VisionService } from './vision.service';
import { CrisisService } from './crisis.service';
import { SummarisationService } from './summarisation.service';
import { PlanService } from './plan.service';

@Module({
  imports: [DataModule],
  providers: [CoachingService, VisionService, CrisisService, SummarisationService, PlanService],
  exports: [CoachingService, VisionService, CrisisService, SummarisationService, PlanService],
})
export class AiModule {}
