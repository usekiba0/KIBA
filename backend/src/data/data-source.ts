import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { User } from './entities/user.entity';
import { Subscription } from './entities/subscription.entity';
import { ConversationSession } from './entities/conversation-session.entity';
import { Message } from './entities/message.entity';
import { NutritionalAnalysis } from './entities/nutritional-analysis.entity';
import { CrisisAlert } from './entities/crisis-alert.entity';
import { SessionSummary } from './entities/session-summary.entity';
import { ProcessedStripeEvent } from './entities/processed-stripe-event.entity';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    User, Subscription, ConversationSession, Message,
    NutritionalAnalysis, CrisisAlert, SessionSummary, ProcessedStripeEvent,
  ],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});
