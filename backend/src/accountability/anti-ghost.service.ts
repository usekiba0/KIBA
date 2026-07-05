import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { AntiGhostState, GhostState, GHOST_LEVEL_DELAY_MS } from '../data/entities/anti-ghost-state.entity';
import { User } from '../data/entities/user.entity';
import { Goal, GoalType } from '../data/entities/goal.entity';
import { findAnchorGoal } from '../data/goal-selection';
import { PsychologicalProfile } from '../data/entities/psychological-profile.entity';
import { StrikeService } from './strike.service';
import { MessagingService } from '../messaging/messaging.service';
import { buildGhostMessage } from '../ai/prompts/ghost.prompt';
import { structuredLog } from '../common/logger';

@Injectable()
export class AntiGhostService {
  private readonly logger = new Logger(AntiGhostService.name);

  constructor(
    @InjectRepository(AntiGhostState) private readonly stateRepo: Repository<AntiGhostState>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Goal) private readonly goalRepo: Repository<Goal>,
    @InjectRepository(PsychologicalProfile) private readonly profileRepo: Repository<PsychologicalProfile>,
    @InjectQueue('accountability') private readonly queue: Queue,
    private readonly strikeService: StrikeService,
    private readonly messagingService: MessagingService,
  ) {}

  async onMissedCheckin(userId: string, taskId: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || user.crisis_hold) return;

    // ── Single-chain guard ────────────────────────────────────────────────
    // A ghost episode is ONE escalation chain. The daily check-in enqueues a
    // `checkin-missed` job every morning, so a user who ghosts several days in
    // a row would otherwise spawn a fresh chain per missed day. The state row
    // only tracks the MOST-RECENT chain's job id, so older chains get orphaned
    // in Bull but keep firing — which stacked up as 4-5 pings landing in the
    // same morning window. Only OPEN a new chain when the user is currently
    // ACTIVE (responsive). If they're already mid-ghost the running chain keeps
    // escalating them on its own; onUserResponse resets to ACTIVE when they
    // reply, so the next genuine miss starts a fresh chain.
    const state = await this.getOrCreateState(userId);
    if (state.state !== GhostState.ACTIVE) {
      structuredLog(this.logger, 'log', {
        service: 'accountability', operation: 'ghost_chain_already_active',
        userId, state: state.state,
      });
      return;
    }

    // Strike fires once per missed cycle (level 1). Levels 2-6 are reengagement
    // pings — they update score implicitly via the strike-1 record + score
    // decay, but don't double-strike. V5 PART 7 only counts ONE strike per
    // missed task, even when the user ghosts for a week after.
    await this.strikeService.logStrike(userId, taskId, 1);

    await this.fireGhostMessage(user, 1);

    // Schedule next escalation +3h (= 5h total since miss = ghost_2)
    const delay = GHOST_LEVEL_DELAY_MS[2];
    const job = await this.queue.add(
      'ghost-escalate',
      { userId, taskId, level: 2 },
      { delay },
    );

    state.state = GhostState.GHOST_1;
    state.next_escalation_at = new Date(Date.now() + delay);
    state.current_job_id = String(job.id);
    await this.stateRepo.save(state);

    structuredLog(this.logger, 'log', {
      service: 'accountability', operation: 'ghost_1', userId,
    });
  }

  /**
   * Levels 2-6. Sends the scripted message, then schedules the next escalation
   * (or ends the chain at level 6).
   */
  async onEscalate(
    userId: string,
    taskId: string,
    level: 2 | 3 | 4 | 5 | 6,
    jobId?: string,
  ): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || user.crisis_hold) return;

    const state = await this.getOrCreateState(userId);

    // ── Orphan-chain guard ────────────────────────────────────────────────
    // Only the chain the state currently points at may proceed. Legacy users
    // from before the single-chain guard have several `ghost-escalate` jobs
    // queued at once; any executing job whose id doesn't match the live
    // current_job_id is a superseded chain — let it die here instead of firing
    // a duplicate ping and re-scheduling itself. This also means a user who
    // replied (current_job_id cleared to null by onUserResponse) silently
    // drains EVERY pending chain, not just the latest one. jobId is optional so
    // existing unit calls stay valid; prod always passes the executing job id.
    if (jobId !== undefined && state.current_job_id !== jobId) {
      structuredLog(this.logger, 'log', {
        service: 'accountability', operation: 'ghost_orphan_dropped',
        userId, level, jobId, currentJobId: state.current_job_id,
      });
      return;
    }

    await this.fireGhostMessage(user, level);

    const stateEnum: GhostState = {
      2: GhostState.GHOST_2,
      3: GhostState.GHOST_3,
      4: GhostState.GHOST_4,
      5: GhostState.GHOST_5,
      6: GhostState.GHOST_6,
    }[level];

    state.state = stateEnum;

    if (level < 6) {
      const nextLevel = (level + 1) as 3 | 4 | 5 | 6;
      const delay = GHOST_LEVEL_DELAY_MS[nextLevel];
      const job = await this.queue.add(
        'ghost-escalate',
        { userId, taskId, level: nextLevel },
        { delay },
      );
      state.next_escalation_at = new Date(Date.now() + delay);
      state.current_job_id = String(job.id);
    } else {
      // Day 7 — final message. Chain ends, KIBA goes silent until user returns.
      state.next_escalation_at = null;
      state.current_job_id = null;
    }

    await this.stateRepo.save(state);

    structuredLog(this.logger, 'log', {
      service: 'accountability', operation: `ghost_${level}`, userId,
    });
  }

  /**
   * Build + send the scripted ghost message for the given level. Profile and
   * goal are loaded lazily; both are optional so a user with sparse intake
   * still gets a usable message.
   *
   * Errors are caught and logged so a single send failure doesn't break the
   * escalation chain — the next level's job is already enqueued by the caller.
   */
  private async fireGhostMessage(user: User, level: 1 | 2 | 3 | 4 | 5 | 6): Promise<void> {
    try {
      const [profile, goal, state] = await Promise.all([
        this.profileRepo.findOne({ where: { user_id: user.id } }),
        findAnchorGoal(this.goalRepo, user.id),
        this.stateRepo.findOne({ where: { user_id: user.id } }),
      ]);
      const lastResponseAt = state?.last_response_at ?? user.last_active_at ?? user.registered_at;
      const days = Math.max(
        1,
        Math.round((Date.now() - new Date(lastResponseAt).getTime()) / (24 * 60 * 60 * 1000)),
      );
      const message = buildGhostMessage(
        level,
        user.name ?? '',
        goal?.description ?? null,
        profile,
        days,
        goal?.goal_type ?? GoalType.OUTCOME,
      );
      await this.messagingService.send(user.phone_number, message);
    } catch (err) {
      this.logger.warn(`ghost-message send failed for ${user.id} level ${level}: ${(err as Error).message}`);
    }
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
