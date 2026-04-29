import { DataSource } from 'typeorm';
import { User } from '../../src/data/entities/user.entity';
import { Message } from '../../src/data/entities/message.entity';
import { ProcessedStripeEvent } from '../../src/data/entities/processed-stripe-event.entity';

describe('PostgreSQL Contract Tests', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      console.warn('DATABASE_URL not set — skipping PostgreSQL contract tests');
      return;
    }
    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [__dirname + '/../../src/**/*.entity{.ts,.js}'],
      synchronize: false,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  describe('Schema integrity', () => {
    it('should have all required tables', async () => {
      if (!process.env.DATABASE_URL) return;

      const tables = await dataSource.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' ORDER BY table_name
      `);
      const tableNames = tables.map((t: any) => t.table_name);

      expect(tableNames).toContain('users');
      expect(tableNames).toContain('subscriptions');
      expect(tableNames).toContain('conversation_sessions');
      expect(tableNames).toContain('messages');
      expect(tableNames).toContain('nutritional_analyses');
      expect(tableNames).toContain('crisis_alerts');
      expect(tableNames).toContain('session_summaries');
      expect(tableNames).toContain('processed_stripe_events');
    });

    it('should enforce UNIQUE constraint on users.phone_number', async () => {
      if (!process.env.DATABASE_URL) return;

      const repo = dataSource.getRepository(User);
      const phone = `+1555${Date.now().toString().slice(-7)}`;

      const user1 = repo.create({ phone_number: phone, name: 'Test', coaching_focus: 'fitness' as any, goals: 'test' });
      await repo.save(user1);

      const user2 = repo.create({ phone_number: phone, name: 'Duplicate', coaching_focus: 'fitness' as any, goals: 'test' });
      await expect(repo.save(user2)).rejects.toThrow();

      await repo.delete({ id: user1.id });
    });

    it('should enforce UNIQUE constraint on messages.twilio_sid', async () => {
      if (!process.env.DATABASE_URL) return;

      const msgRepo = dataSource.getRepository(Message);
      const sid = `SM${Date.now()}test`;

      const msg1 = msgRepo.create({
        user_id: '00000000-0000-0000-0000-000000000001',
        session_id: '00000000-0000-0000-0000-000000000001',
        role: 'user' as any, message_type: 'text' as any, content: 'test', twilio_sid: sid,
      });
      await msgRepo.save(msg1);

      const msg2 = msgRepo.create({
        user_id: '00000000-0000-0000-0000-000000000001',
        session_id: '00000000-0000-0000-0000-000000000001',
        role: 'ai' as any, message_type: 'text' as any, content: 'duplicate', twilio_sid: sid,
      });
      await expect(msgRepo.save(msg2)).rejects.toThrow();

      await msgRepo.delete({ id: msg1.id });
    });

    it('should enforce PRIMARY KEY uniqueness on processed_stripe_events', async () => {
      if (!process.env.DATABASE_URL) return;

      const repo = dataSource.getRepository(ProcessedStripeEvent);
      const eventId = `evt_contract_test_${Date.now()}`;

      await repo.insert({ stripe_event_id: eventId, event_type: 'test' });
      await expect(repo.insert({ stripe_event_id: eventId, event_type: 'duplicate' })).rejects.toThrow();

      await repo.delete({ stripe_event_id: eventId });
    });
  });
});
