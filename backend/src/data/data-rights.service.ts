import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

    await this.alertRepo.delete({ user_id: userId });
    await this.nutritionRepo.delete({ user_id: userId });
    await this.summaryRepo.delete({ user_id: userId });
    await this.messageRepo.delete({ user_id: userId });
    await this.sessionRepo.delete({ user_id: userId });
    await this.subRepo.delete({ user_id: userId });
    await this.userRepo.delete({ id: userId });
  }
}
