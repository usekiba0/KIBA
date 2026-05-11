import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { AdminService } from '../../src/data/admin.service';
import { User } from '../../src/data/entities/user.entity';
import { Message } from '../../src/data/entities/message.entity';
import { Subscription } from '../../src/data/entities/subscription.entity';
import { CrisisAlert } from '../../src/data/entities/crisis-alert.entity';
import { ConversationSession } from '../../src/data/entities/conversation-session.entity';
import { ConfigService } from '@nestjs/config';

const baseUserRow = {
  id: 'user-1', name: 'Alex', phone_number: '+15551234567',
  coaching_focus: null, goals: null, status: 'active',
  crisis_hold: false, last_active_at: new Date(), registered_at: new Date(),
  sub_id: 'sub-1', sub_plan: 'individual', sub_status: 'active',
  trial_end: null, current_period_end: null,
};

describe('AdminService — T074 listUsers', () => {
  let service: AdminService;
  let mockDataSource: any;

  beforeEach(async () => {
    mockDataSource = {
      query: jest.fn().mockResolvedValue([{
        ...baseUserRow,
        execution_score: 72,
        strike_count: 2,
        plan_status: 'generated',
      }]),
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(User), useValue: { update: jest.fn() } },
        { provide: getRepositoryToken(Message), useValue: { find: jest.fn(), update: jest.fn(), findOne: jest.fn() } },
        { provide: getRepositoryToken(Subscription), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(CrisisAlert), useValue: { findOneOrFail: jest.fn(), update: jest.fn() } },
        { provide: getRepositoryToken(ConversationSession), useValue: {} },
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('includes execution_score in the user list response', async () => {
    const users = await service.listUsers();
    expect(users[0]).toHaveProperty('execution_score', 72);
  });

  it('includes strike_count in the user list response', async () => {
    const users = await service.listUsers();
    expect(users[0]).toHaveProperty('strike_count', 2);
  });

  it('includes plan_status in the user list response', async () => {
    const users = await service.listUsers();
    expect(users[0]).toHaveProperty('plan_status', 'generated');
  });

  it('still includes the standard subscription block', async () => {
    const users = await service.listUsers();
    expect(users[0].subscription).toBeDefined();
    expect(users[0].subscription?.plan).toBe('individual');
  });
});

describe('AdminService — T076 getUserDetail', () => {
  let service: AdminService;
  let mockDataSource: any;

  const profileRow = {
    fears: 'staying stuck', avoidance_patterns: 'scrolling',
    comparison_figure: 'college roommate', public_failure_scenario: 'friends find out',
    typical_failure_moment: 'Sunday evenings', pressure_preference: 'pressure',
  };

  const goalRow = {
    id: 'goal-1', description: 'Run a 5K', timeline: '3 months',
    current_status: 'just started', difficulty_level: 3,
    action_plan: { milestones: [], weekly_breakdown: [], daily_tasks: [] },
  };

  const scoreRows = [
    { current_score: 72, snapshot_date: new Date() },
    { current_score: 65, snapshot_date: new Date() },
  ];

  const strikesRow = [{ count: '3' }];

  beforeEach(async () => {
    mockDataSource = {
      query: jest.fn()
        .mockResolvedValueOnce([{ ...baseUserRow }])   // user row
        .mockResolvedValueOnce([profileRow])           // psych profile
        .mockResolvedValueOnce([goalRow])              // goal
        .mockResolvedValueOnce([])                     // tasks (today)
        .mockResolvedValueOnce(scoreRows)              // score history
        .mockResolvedValueOnce(strikesRow),            // strike count
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(User), useValue: { update: jest.fn() } },
        { provide: getRepositoryToken(Message), useValue: { find: jest.fn(), update: jest.fn(), findOne: jest.fn() } },
        { provide: getRepositoryToken(Subscription), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(CrisisAlert), useValue: { findOneOrFail: jest.fn(), update: jest.fn() } },
        { provide: getRepositoryToken(ConversationSession), useValue: {} },
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('returns user basic info', async () => {
    const detail = await service.getUserDetail('user-1');
    expect(detail.user).toBeDefined();
    expect(detail.user?.id).toBe('user-1');
  });

  it('returns the psychological profile', async () => {
    const detail = await service.getUserDetail('user-1');
    expect(detail.psychological_profile).toBeDefined();
    expect(detail.psychological_profile?.fears).toBe('staying stuck');
  });

  it('returns the goal', async () => {
    const detail = await service.getUserDetail('user-1');
    expect(detail.goal).toBeDefined();
    expect(detail.goal?.description).toBe('Run a 5K');
  });

  it('returns score history', async () => {
    const detail = await service.getUserDetail('user-1');
    expect(Array.isArray(detail.score_history)).toBe(true);
    expect(detail.score_history).toHaveLength(2);
  });

  it('returns recent strike count', async () => {
    const detail = await service.getUserDetail('user-1');
    expect(detail.strike_count_7d).toBe(3);
  });
});
