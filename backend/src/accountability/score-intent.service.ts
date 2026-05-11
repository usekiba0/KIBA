import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExecutionScore } from '../data/entities/execution-score.entity';

const SCORE_INTENTS = ['my score', 'how am i doing', 'execution score'];

@Injectable()
export class ScoreIntentService {
  constructor(
    @InjectRepository(ExecutionScore) private readonly scoreRepo: Repository<ExecutionScore>,
  ) {}

  isScoreIntent(body: string): boolean {
    const lower = body.toLowerCase();
    return SCORE_INTENTS.some((phrase) => lower.includes(phrase));
  }

  async buildScoreReply(userId: string): Promise<string> {
    const score = await this.scoreRepo.findOne({
      where: { user_id: userId },
      order: { snapshot_date: 'DESC' },
    });

    if (!score) {
      return "No score recorded yet — you haven't completed any check-ins. Start today.";
    }

    const s = score.current_score;
    let label: string;
    if (s >= 80) label = 'Strong. Keep the pressure on.';
    else if (s >= 60) label = 'Decent — but there is room to close the gap.';
    else if (s >= 30) label = 'Below where you need to be. You know what to do.';
    else label = 'This is a problem. You are not showing up.';

    return `Execution score: ${s}/100. ${label}`;
  }
}
