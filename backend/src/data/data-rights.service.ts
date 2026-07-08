import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Repository, DataSource } from 'typeorm';
import { User } from './entities/user.entity';
import { Subscription } from './entities/subscription.entity';
import { Message } from './entities/message.entity';
import { NutritionalAnalysis } from './entities/nutritional-analysis.entity';
import { SessionSummary } from './entities/session-summary.entity';
import { CrisisAlert } from './entities/crisis-alert.entity';
import { ConversationSession } from './entities/conversation-session.entity';
import { StripeService } from '../onboarding/stripe.service';

@Injectable()
export class DataRightsService {
  private readonly logger = new Logger(DataRightsService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
    @InjectRepository(Message) private readonly messageRepo: Repository<Message>,
    @InjectRepository(NutritionalAnalysis)
    private readonly nutritionRepo: Repository<NutritionalAnalysis>,
    @InjectRepository(SessionSummary) private readonly summaryRepo: Repository<SessionSummary>,
    @InjectRepository(CrisisAlert) private readonly alertRepo: Repository<CrisisAlert>,
    @InjectRepository(ConversationSession)
    private readonly sessionRepo: Repository<ConversationSession>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue('accountability') private readonly accountabilityQueue: Queue,
    private readonly stripeService: StripeService,
  ) {}

  async exportUserData(userId: string) {
    const [user, subscription, messages, analyses, summaries, alerts, sessions] = await Promise.all(
      [
        this.userRepo.findOne({ where: { id: userId } }),
        this.subRepo.findOne({ where: { user_id: userId } }),
        this.messageRepo.find({ where: { user_id: userId }, order: { created_at: 'ASC' } }),
        this.nutritionRepo.find({ where: { user_id: userId } }),
        this.summaryRepo.find({ where: { user_id: userId } }),
        this.alertRepo.find({ where: { user_id: userId } }),
        this.sessionRepo.find({ where: { user_id: userId } }),
      ],
    );
    return {
      user,
      subscription,
      messages,
      nutritional_analyses: analyses,
      session_summaries: summaries,
      crisis_alerts: alerts,
      sessions,
    };
  }

  async deleteUserData(userId: string): Promise<void> {
    // Capture this user's queued reminder job ids BEFORE the rows are wiped —
    // the Bull jobs live in Redis keyed by reminderId (not userId), so once the
    // scheduled_reminders rows are gone we can no longer map jobs back to the
    // user. Read fails soft: a missing id just means we skip one job removal.
    let reminderJobIds: string[] = [];
    try {
      const rows: Array<{ bull_job_id: string | null }> = await this.dataSource.query(
        'SELECT bull_job_id FROM scheduled_reminders WHERE user_id = $1 AND bull_job_id IS NOT NULL',
        [userId],
      );
      reminderJobIds = rows.map((r) => r.bull_job_id).filter((id): id is string => !!id);
    } catch (err) {
      this.logger.warn(`[DataRights] could not read reminder jobs for ${userId}: ${(err as Error).message}`);
    }

    const sub = await this.subRepo.findOne({ where: { user_id: userId } });
    if (sub?.stripe_subscription_id) {
      try {
        await this.stripeService.cancelSubscription(sub.stripe_subscription_id);
      } catch (err) {
        this.logger.error(`[DataRights] Stripe cancellation failed for sub ${sub.stripe_subscription_id}: ${(err as Error).message}`);
      }
    }

    // Wipe every row scoped to this user across all tables that carry a
    // `user_id` column, then the user row itself — in one transaction so a
    // failure mid-way leaves nothing half-deleted. Driven off entity metadata
    // (not a hand-maintained list) so any new user-scoped table is covered
    // automatically; the DB has no ON DELETE CASCADE constraints, so without
    // this an admin/GDPR delete would leave orphaned messages, goals, proofs,
    // scores, strikes, etc. behind.
    const userScopedTables = this.dataSource.entityMetadatas
      .filter((meta) => meta.tableName !== 'users')
      .filter((meta) => meta.columns.some((col) => col.databaseName === 'user_id'))
      .map((meta) => meta.tableName);

    await this.dataSource.transaction(async (manager) => {
      for (const tableName of userScopedTables) {
        await manager.query(`DELETE FROM "${tableName}" WHERE user_id = $1`, [userId]);
      }
      await manager.query(`DELETE FROM "users" WHERE id = $1`, [userId]);
    });

    // Drain the user's Bull jobs so nothing keeps firing for a user that no
    // longer exists. Without this, deleted test accounts left send-checkin /
    // reminder / recap / surprise / weekly-review jobs orphaned in Redis, still
    // waking up every morning (Karibi 2026-07-08). Fails soft — the DB wipe is
    // the source of truth and orphaned jobs no-op, so a Redis blip must not make
    // the delete look failed.
    await this.drainQueueForUser(userId, reminderJobIds);
  }

  /**
   * Remove every not-yet-run Bull job belonging to a user across two keying
   * schemes: scheduled reminders carry only a `reminderId` (removed by the job
   * ids we captured before the wipe), while check-ins, ghost escalations,
   * recaps, surprises, weekly reviews and dunning nudges carry `userId` in their
   * job data (scanned out of the delayed/waiting/paused states). Running jobs
   * are left alone — they finish and then no-op on the missing user.
   */
  private async drainQueueForUser(userId: string, reminderJobIds: string[]): Promise<void> {
    try {
      for (const jobId of reminderJobIds) {
        const job = await this.accountabilityQueue.getJob(jobId);
        if (job) await job.remove().catch(() => undefined);
      }

      const jobs = await this.accountabilityQueue.getJobs(['delayed', 'waiting', 'paused']);
      for (const job of jobs) {
        if (job?.data?.userId === userId) {
          await job.remove().catch(() => undefined);
        }
      }
    } catch (err) {
      this.logger.error(`[DataRights] queue drain failed for ${userId}: ${(err as Error).message}`);
    }
  }
}
