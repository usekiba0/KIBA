import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
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
  }
}
