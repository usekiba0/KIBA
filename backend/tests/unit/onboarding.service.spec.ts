import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { OnboardingService } from '../../src/onboarding/onboarding.service';
import { StripeService } from '../../src/onboarding/stripe.service';
import { User, UserStatus } from '../../src/data/entities/user.entity';
import { Subscription } from '../../src/data/entities/subscription.entity';
import { PsychologicalProfile, PressurePreference } from '../../src/data/entities/psychological-profile.entity';
import { Goal } from '../../src/data/entities/goal.entity';
import { OnboardingFormDto } from '../../src/onboarding/dto/onboarding-form.dto';

const mockDto: OnboardingFormDto = {
  name: 'Alex',
  phone_number: '+12125551234',
  goal_description: 'Run a 5K in under 30 minutes',
  goal_timeline: '60 days',
  current_status: 'I can barely run 1K',
  fears: 'Staying stuck while everyone moves forward',
  avoidance_patterns: 'Scrolling phone when I should be working',
  comparison_figure: 'My college roommate',
  public_failure_scenario: 'Friends finding out I quit again',
  typical_failure_moment: 'Sunday evenings',
  pressure_preference: PressurePreference.PRESSURE,
  checkin_time: '08:00',
  stripe_payment_method_id: 'pm_test_abc',
};

describe('OnboardingService — psychological profile + goal creation', () => {
  let service: OnboardingService;
  let mockManager: any;
  let messagingQueue: any;

  beforeEach(async () => {
    const savedUser: Partial<User> = {
      id: 'user-1',
      phone_number: mockDto.phone_number,
      name: mockDto.name,
      status: UserStatus.TRIAL,
    };

    mockManager = {
      create: jest.fn((Entity: any, data: any) => ({ ...data })),
      save: jest.fn(async (_Entity: any, entity: any) => {
        if (entity.phone_number) return { ...entity, id: 'user-1' };
        return entity;
      }),
    };

    const mockDataSource = {
      transaction: jest.fn(async (cb: (manager: any) => Promise<any>) => cb(mockManager)),
    };

    messagingQueue = { add: jest.fn().mockResolvedValue({}) };

    const mockStripe = {
      createCustomer: jest.fn().mockResolvedValue({ id: 'cus_test' }),
      createSetupIntent: jest.fn().mockResolvedValue({ client_secret: 'seti_secret' }),
      createSubscriptionWithTrial: jest.fn().mockResolvedValue({
        id: 'sub_test',
        trial_end: Math.floor(Date.now() / 1000) + 86400 * 30,
      }),
      cancelSubscription: jest.fn().mockResolvedValue({}),
      deleteCustomer: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: getRepositoryToken(Subscription), useValue: {} },
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: getQueueToken('messaging'), useValue: messagingQueue },
        { provide: StripeService, useValue: mockStripe },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: any) => {
              if (key === 'STRIPE_PRICE_ID_INDIVIDUAL') return 'price_test';
              if (key === 'STRIPE_TRIAL_DAYS') return 30;
              if (key === 'BETA_MODE') return 'false';
              return def;
            }),
            getOrThrow: jest.fn(() => 'price_test'),
          },
        },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  it('saves a PsychologicalProfile with all intake fields in the transaction', async () => {
    await service.submit(mockDto);

    const profileSave = mockManager.save.mock.calls.find(
      ([Entity]: [any]) => Entity === PsychologicalProfile,
    );
    expect(profileSave).toBeDefined();
    const savedProfile = profileSave[1];
    expect(savedProfile.fears).toBe(mockDto.fears);
    expect(savedProfile.avoidance_patterns).toBe(mockDto.avoidance_patterns);
    expect(savedProfile.comparison_figure).toBe(mockDto.comparison_figure);
    expect(savedProfile.public_failure_scenario).toBe(mockDto.public_failure_scenario);
    expect(savedProfile.typical_failure_moment).toBe(mockDto.typical_failure_moment);
    expect(savedProfile.pressure_preference).toBe(PressurePreference.PRESSURE);
    expect(savedProfile.user_id).toBe('user-1');
  });

  it('saves a Goal with goal fields in the transaction', async () => {
    await service.submit(mockDto);

    const goalSave = mockManager.save.mock.calls.find(
      ([Entity]: [any]) => Entity === Goal,
    );
    expect(goalSave).toBeDefined();
    const savedGoal = goalSave[1];
    expect(savedGoal.description).toBe(mockDto.goal_description);
    expect(savedGoal.timeline).toBe(mockDto.goal_timeline);
    expect(savedGoal.current_status).toBe(mockDto.current_status);
    expect(savedGoal.user_id).toBe('user-1');
    expect(savedGoal.difficulty_level).toBe(3);
  });

  it('queues a plan-generation job after the welcome message', async () => {
    await service.submit(mockDto);

    const planJob = messagingQueue.add.mock.calls.find(
      ([jobName]: [string]) => jobName === 'plan-generation',
    );
    expect(planJob).toBeDefined();
    expect(planJob[1]).toMatchObject({ userId: 'user-1' });
  });

  it('welcome message references the user fear from psychological intake', async () => {
    await service.submit(mockDto);

    const welcomeJob = messagingQueue.add.mock.calls.find(
      ([jobName]: [string]) => jobName === 'send-message',
    );
    expect(welcomeJob).toBeDefined();
    const body: string = welcomeJob[1].body;
    expect(body.toLowerCase()).toMatch(/stay|stuck|forward|fear|goal|run|alex/i);
  });

  it('throws ConflictException if phone number already exists', async () => {
    const module = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn().mockResolvedValue({ id: 'existing' }) } },
        { provide: getRepositoryToken(Subscription), useValue: {} },
        { provide: getDataSourceToken(), useValue: {} },
        { provide: getQueueToken('messaging'), useValue: messagingQueue },
        { provide: StripeService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn(), getOrThrow: jest.fn() } },
      ],
    }).compile();

    const svc = module.get<OnboardingService>(OnboardingService);
    await expect(svc.submit(mockDto)).rejects.toThrow(ConflictException);
  });
});
