import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { AntiGhostState, GhostState, GHOST_LEVEL_DELAY_MS } from '../data/entities/anti-ghost-state.entity';
import { User } from '../data/entities/user.entity';
import { Goal, GoalType } from '../data/entities/goal.entity';
import { Message, MessageRole } from '../data/entities/message.entity';
import { findAnchorGoal } from '../data/goal-selection';
import { PsychologicalProfile } from '../data/entities/psychological-profile.entity';
import { StrikeService } from './strike.service';
import { MessagingService } from '../messaging/messaging.service';
import { buildGhostMessage } from '../ai/prompts/ghost.prompt';
import { statesTemporaryReturn } from './ghost-context';
import { OutboundRecorderService } from '../data/outbound-recorder.service';
import { structuredLog } from '../common/logger';

// Ghost context-suppression (Rule 13). If the user's last inbound said they'd be
// back later ("after the game", "going to sleep"), the missed-checkin ghost
// waits this long instead of firing over their own stated plan. Deferred at most
// once per chain — if they're still quiet after, the normal escalation proceeds.
const GHOST_DEFER_MS = 3 * 60 * 60 * 1000;
// Only a RECENT "back later" defers — an away message older than this is stale
// and shouldn't hold off the ghost (covers the 2h missed-checkin delay + buffer).
const STATED_RETURN_WINDOW_MS = 6 * 60 * 60 * 1000;
// Fire-time activity backstop. If the user has texted within this window they are
// demonstrably present, so a "you went quiet — that's a miss" ghost must never
// send. onUserResponse already drains the chain when they reply, but if it lost a
// race with an already-active escalation job the ghost would fire anyway (Karibi
// 2026-07-16: level-2 ghost landed minutes after the user's update). This deter-
// ministic re-check at send time closes that race independent of onUserResponse.
const RECENT_ACTIVITY_MS = 90 * 60 * 1000;

@Injectable()
export class AntiGhostService {
  private readonly logger = new Logger(AntiGhostService.name);

  constructor(
    @InjectRepository(AntiGhostState) private readonly stateRepo: Repository<AntiGhostState>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Goal) private readonly goalRepo: Repository<Goal>,
    @InjectRepository(PsychologicalProfile) private readonly profileRepo: Repository<PsychologicalProfile>,
    @InjectRepository(Message) private readonly messageRepo: Repository<Message>,
    @InjectQueue('accountability') private readonly queue: Queue,
    private readonly strikeService: StrikeService,
    private readonly messagingService: MessagingService,
    private readonly recorder: OutboundRecorderService,
  ) {}

  /**
   * @param alreadyDeferred set by a re-enqueued job — true means this chain has
   *   already waited once for a stated return, so we fire regardless now (a
   *   permanent "gn" must never suppress the ghost forever).
   */
  async onMissedCheckin(userId: string, taskId: string, alreadyDeferred = false): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || user.crisis_hold) return;

    // ── Context-suppression (Rule 13) ─────────────────────────────────────
    // Never ghost-blast a user who just told KIBA they'd be back later. If their
    // most recent inbound stated a return ("after the game", "going to sleep")
    // and it's recent, defer the whole chain ONCE (re-enqueue with deferred=true)
    // instead of firing. If they're still quiet after the wait, it fires normally.
    if (!alreadyDeferred) {
      const lastInbound = await this.messageRepo.findOne({
        where: { user_id: userId, role: MessageRole.USER },
        order: { created_at: 'DESC' },
      });
      const recent =
        lastInbound &&
        Date.now() - new Date(lastInbound.created_at).getTime() <= STATED_RETURN_WINDOW_MS;
      if (recent && statesTemporaryReturn(lastInbound!.content)) {
        await this.queue.add(
          'checkin-missed',
          { userId, taskId, deferred: true },
          { delay: GHOST_DEFER_MS },
        );
        structuredLog(this.logger, 'log', {
          service: 'accountability', operation: 'ghost_deferred_stated_return', userId,
        });
        return;
      }
    }

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

    // ── Fire-time activity backstop ───────────────────────────────────────
    // Never tell an actively-texting user they "went quiet". onUserResponse is
    // supposed to drain this chain the moment they reply, but if it lost a race
    // with this now-active job the ghost would fire over a live conversation. A
    // recent inbound means they're present — reset to ACTIVE and drop the chain
    // instead of sending. See RECENT_ACTIVITY_MS.
    if (await this.hasRecentInbound(userId)) {
      state.state = GhostState.ACTIVE;
      state.next_escalation_at = null;
      state.current_job_id = null;
      await this.stateRepo.save(state);
      structuredLog(this.logger, 'log', {
        service: 'accountability', operation: 'ghost_suppressed_recent_activity',
        userId, level,
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
      // Visible to the live coaching layer + admin API (Retraining doc B1) —
      // KIBA must be able to see (and own) the ghosts it sent.
      await this.recorder.record(user.id, message, 'ghost');
    } catch (err) {
      this.logger.warn(`ghost-message send failed for ${user.id} level ${level}: ${(err as Error).message}`);
    }
  }

  /**
   * True if the user's most recent inbound message is within RECENT_ACTIVITY_MS.
   * Deterministic backstop so a ghost escalation never fires over an active
   * conversation, independent of whether onUserResponse ran for that inbound.
   */
  private async hasRecentInbound(userId: string): Promise<boolean> {
    const last = await this.messageRepo.findOne({
      where: { user_id: userId, role: MessageRole.USER },
      order: { created_at: 'DESC' },
    });
    return (
      !!last &&
      Date.now() - new Date(last.created_at).getTime() <= RECENT_ACTIVITY_MS
    );
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
