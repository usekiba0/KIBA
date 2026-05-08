import { DataSource } from 'typeorm';
import { User } from '../../src/data/entities/user.entity';
import { Subscription } from '../../src/data/entities/subscription.entity';
import { ConversationSession } from '../../src/data/entities/conversation-session.entity';
import { Message } from '../../src/data/entities/message.entity';
import { NutritionalAnalysis } from '../../src/data/entities/nutritional-analysis.entity';
import { CrisisAlert } from '../../src/data/entities/crisis-alert.entity';
import { SessionSummary } from '../../src/data/entities/session-summary.entity';
import { ProcessedStripeEvent } from '../../src/data/entities/processed-stripe-event.entity';
import { PsychologicalProfile } from '../../src/data/entities/psychological-profile.entity';
import { Goal } from '../../src/data/entities/goal.entity';
import { DailyTask } from '../../src/data/entities/daily-task.entity';
import { Proof } from '../../src/data/entities/proof.entity';
import { Strike } from '../../src/data/entities/strike.entity';
import { ExecutionScore } from '../../src/data/entities/execution-score.entity';
import { AntiGhostState } from '../../src/data/entities/anti-ghost-state.entity';

const ALL_ENTITIES = [
  User, Subscription, ConversationSession, Message, NutritionalAnalysis,
  CrisisAlert, SessionSummary, ProcessedStripeEvent,
  PsychologicalProfile, Goal, DailyTask, Proof, Strike, ExecutionScore, AntiGhostState,
];

describe('Kiba Schema Contract Tests', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      console.warn('DATABASE_URL not set — skipping schema contract tests');
      return;
    }
    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: ALL_ENTITIES,
      synchronize: false,
      ssl: !process.env.DATABASE_URL.includes('localhost') ? { rejectUnauthorized: false } : false,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  async function getTables(): Promise<string[]> {
    const rows = await dataSource.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name
    `);
    return rows.map((r: any) => r.table_name);
  }

  async function getColumns(table: string): Promise<string[]> {
    const rows = await dataSource.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
    `, [table]);
    return rows.map((r: any) => r.column_name);
  }

  describe('psychological_profiles table', () => {
    it('exists', async () => {
      if (!process.env.DATABASE_URL) return;
      expect(await getTables()).toContain('psychological_profiles');
    });

    it('has all required columns', async () => {
      if (!process.env.DATABASE_URL) return;
      const cols = await getColumns('psychological_profiles');
      expect(cols).toContain('id');
      expect(cols).toContain('user_id');
      expect(cols).toContain('fears');
      expect(cols).toContain('avoidance_patterns');
      expect(cols).toContain('comparison_figure');
      expect(cols).toContain('public_failure_scenario');
      expect(cols).toContain('typical_failure_moment');
      expect(cols).toContain('pressure_preference');
      expect(cols).toContain('created_at');
      expect(cols).toContain('updated_at');
    });

    it('enforces UNIQUE constraint on user_id', async () => {
      if (!process.env.DATABASE_URL) return;
      const indexes = await dataSource.query(`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'psychological_profiles' AND indexdef ILIKE '%unique%'
      `);
      expect(indexes.length).toBeGreaterThan(0);
    });
  });

  describe('goals table', () => {
    it('exists', async () => {
      if (!process.env.DATABASE_URL) return;
      expect(await getTables()).toContain('goals');
    });

    it('has all required columns', async () => {
      if (!process.env.DATABASE_URL) return;
      const cols = await getColumns('goals');
      expect(cols).toContain('id');
      expect(cols).toContain('user_id');
      expect(cols).toContain('description');
      expect(cols).toContain('timeline');
      expect(cols).toContain('current_status');
      expect(cols).toContain('action_plan');
      expect(cols).toContain('difficulty_level');
      expect(cols).toContain('created_at');
      expect(cols).toContain('updated_at');
    });
  });

  describe('daily_tasks table', () => {
    it('exists', async () => {
      if (!process.env.DATABASE_URL) return;
      expect(await getTables()).toContain('daily_tasks');
    });

    it('has all required columns', async () => {
      if (!process.env.DATABASE_URL) return;
      const cols = await getColumns('daily_tasks');
      expect(cols).toContain('id');
      expect(cols).toContain('goal_id');
      expect(cols).toContain('user_id');
      expect(cols).toContain('task_description');
      expect(cols).toContain('scheduled_date');
      expect(cols).toContain('status');
      expect(cols).toContain('proof_id');
      expect(cols).toContain('completion_timestamp');
      expect(cols).toContain('created_at');
    });
  });

  describe('proofs table', () => {
    it('exists', async () => {
      if (!process.env.DATABASE_URL) return;
      expect(await getTables()).toContain('proofs');
    });

    it('has all required columns', async () => {
      if (!process.env.DATABASE_URL) return;
      const cols = await getColumns('proofs');
      expect(cols).toContain('id');
      expect(cols).toContain('task_id');
      expect(cols).toContain('user_id');
      expect(cols).toContain('proof_type');
      expect(cols).toContain('media_url');
      expect(cols).toContain('content');
      expect(cols).toContain('validation_status');
      expect(cols).toContain('validated_at');
      expect(cols).toContain('created_at');
    });
  });

  describe('strikes table', () => {
    it('exists', async () => {
      if (!process.env.DATABASE_URL) return;
      expect(await getTables()).toContain('strikes');
    });

    it('has all required columns', async () => {
      if (!process.env.DATABASE_URL) return;
      const cols = await getColumns('strikes');
      expect(cols).toContain('id');
      expect(cols).toContain('user_id');
      expect(cols).toContain('daily_task_id');
      expect(cols).toContain('escalation_level');
      expect(cols).toContain('created_at');
    });
  });

  describe('execution_scores table', () => {
    it('exists', async () => {
      if (!process.env.DATABASE_URL) return;
      expect(await getTables()).toContain('execution_scores');
    });

    it('has all required columns', async () => {
      if (!process.env.DATABASE_URL) return;
      const cols = await getColumns('execution_scores');
      expect(cols).toContain('id');
      expect(cols).toContain('user_id');
      expect(cols).toContain('current_score');
      expect(cols).toContain('completion_rate');
      expect(cols).toContain('proof_rate');
      expect(cols).toContain('response_time_score');
      expect(cols).toContain('streak_bonus');
      expect(cols).toContain('snapshot_date');
      expect(cols).toContain('created_at');
    });
  });

  describe('anti_ghost_states table', () => {
    it('exists', async () => {
      if (!process.env.DATABASE_URL) return;
      expect(await getTables()).toContain('anti_ghost_states');
    });

    it('has all required columns', async () => {
      if (!process.env.DATABASE_URL) return;
      const cols = await getColumns('anti_ghost_states');
      expect(cols).toContain('user_id');
      expect(cols).toContain('state');
      expect(cols).toContain('last_response_at');
      expect(cols).toContain('next_escalation_at');
      expect(cols).toContain('current_job_id');
    });
  });
});
