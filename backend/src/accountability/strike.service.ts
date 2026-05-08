import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Strike } from '../data/entities/strike.entity';
import { DailyTask, TaskStatus } from '../data/entities/daily-task.entity';
import { structuredLog } from '../common/logger';

@Injectable()
export class StrikeService {
  private readonly logger = new Logger(StrikeService.name);

  constructor(
    @InjectRepository(Strike) private readonly strikeRepo: Repository<Strike>,
    @InjectRepository(DailyTask) private readonly taskRepo: Repository<DailyTask>,
  ) {}

  async logStrike(userId: string, taskId: string, escalationLevel: number): Promise<Strike> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (task) {
      task.status = TaskStatus.MISSED;
      await this.taskRepo.save(task);
    }

    const strike = this.strikeRepo.create({
      user_id: userId,
      daily_task_id: taskId,
      escalation_level: escalationLevel,
    });
    const saved = await this.strikeRepo.save(strike);

    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'strike_logged',
      userId,
      taskId,
      escalationLevel,
    });

    return saved;
  }

  async getStrikeCount(userId: string, sincedays = 7): Promise<number> {
    const since = new Date();
    since.setDate(since.getDate() - sincedays);
    const strikes = await this.strikeRepo.find({
      where: { user_id: userId, created_at: MoreThanOrEqual(since) },
    });
    return strikes.length;
  }
}
