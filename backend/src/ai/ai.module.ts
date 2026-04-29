import { Module } from '@nestjs/common';
import { DataModule } from '../data/data.module';
import { CoachingService } from './coaching.service';
import { VisionService } from './vision.service';
import { CrisisService } from './crisis.service';
import { SummarisationService } from './summarisation.service';

@Module({
  imports: [DataModule],
  providers: [CoachingService, VisionService, CrisisService, SummarisationService],
  exports: [CoachingService, VisionService, CrisisService, SummarisationService],
})
export class AiModule {}
