import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { AntiGhostState, GhostState } from '../data/entities/anti-ghost-state.entity';
import { User } from '../data/entities/user.entity';
import { StrikeService } from './strike.service';
import { structuredLog } from '../common/logger';

const GHOST_1_DELAY_MS = 24 * 60 * 60 * 1000;  // 24h to ghost_2
const GHOST_2_DELAY_MS = 24 * 60 * 60 * 1000;  // another 24h to ghost_3

@Injectable()
export class AntiGhostService {
  private readonly logger = new Logger(AntiGhostService.name);

  constructor(
    @InjectRepository(AntiGhostState) private readonly stateRepo: Repository<AntiGhostState>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectQueue('accountability') private readonly queue: Queue,
    private readonly strikeService: StrikeService,
  ) {}

  async onMissedCheckin(userId: string, taskId: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (user?.crisis_hold) return;

    await this.strikeService.logStrike(userId, taskId, 1);

    const job = await this.queue.add(
      'ghost-escalate',
      { userId, taskId, level: 2 },
      { delay: GHOST_1_DELAY_MS },
    );

    const state = await this.getOrCreateState(userId);
    state.state = GhostState.GHOST_1;
    state.next_escalation_at = new Date(Date.now() + GHOST_1_DELAY_MS);
    state.current_job_id = String(job.id);
    await this.stateRepo.save(state);

    structuredLog(this.logger, 'log', {
      service: 'accountability', operation: 'ghost_1', userId,
    });
  }

  async onEscalate(userId: string, taskId: string, level: 2 | 3): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (user?.crisis_hold) return;

    await this.strikeService.logStrike(userId, taskId, level);

    const nextState = level === 2 ? GhostState.GHOST_2 : GhostState.GHOST_3;
    const state = await this.getOrCreateState(userId);
    state.state = nextState;

    if (level === 2) {
      const job = await this.queue.add(
        'ghost-escalate',
        { userId, taskId, level: 3 },
        { delay: GHOST_2_DELAY_MS },
      );
      state.next_escalation_at = new Date(Date.now() + GHOST_2_DELAY_MS);
      state.current_job_id = String(job.id);
    } else {
      state.next_escalation_at = null;
      state.current_job_id = null;
    }

    await this.stateRepo.save(state);

    structuredLog(this.logger, 'log', {
      service: 'accountability', operation: `ghost_${level}`, userId,
    });
  }

  async onUserResponse(userId: string): Promise<void> {
    const state = await this.getOrCreateState(userId);

    if (state.current_job_id) {
      const job = await this.queue.getJob(state.current_job_id);
      if (job) await job.remove();
    }

    state.state = GhostState.ACTIVE;
    state.last_response_at = new Date();
    state.next_escalation_at = null;
    state.current_job_id = null;
    await this.stateRepo.save(state);
  }

  async getState(userId: string): Promise<GhostState> {
    const state = await this.stateRepo.findOne({ where: { user_id: userId } });
    return state?.state ?? GhostState.ACTIVE;
  }

  private async getOrCreateState(userId: string): Promise<AntiGhostState> {
    const existing = await this.stateRepo.findOne({ where: { user_id: userId } });
    if (existing) return existing;
    return this.stateRepo.create({
      user_id: userId,
      state: GhostState.ACTIVE,
      last_response_at: new Date(),
    });
  }
}
