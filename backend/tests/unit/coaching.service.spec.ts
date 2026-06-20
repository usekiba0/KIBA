import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { CoachingService } from '../../src/ai/coaching.service';
import { User, UserStatus } from '../../src/data/entities/user.entity';
import { Message, MessageRole, MessageType } from '../../src/data/entities/message.entity';
import { PsychologicalProfile, PressurePreference } from '../../src/data/entities/psychological-profile.entity';
import { ExecutionScore } from '../../src/data/entities/execution-score.entity';
import { Strike } from '../../src/data/entities/strike.entity';
import { CorrectionService } from '../../src/data/correction.service';

// Partial mock — cast because User has many columns coaching never reads.
const testUser = {
  id: 'user-1', phone_number: '+15551234567', name: 'Alex',
  coaching_focus: null as any, goals: null as any,
  height_cm: null, weight_kg: null, age: null,
  health_conditions: [], dietary_restrictions: [], injuries: null,
  status: UserStatus.TRIAL, crisis_hold: false,
  checkin_time: '09:00',
  registered_at: new Date(), last_active_at: null,
} as unknown as User;

const testProfile: PsychologicalProfile = {
  id: 'profile-1', user_id: 'user-1',
  fears: 'Staying stuck', avoidance_patterns: 'Scrolling phone',
  comparison_figure: 'College roommate', public_failure_scenario: 'Friends find out',
  typical_failure_moment: 'Sunday evenings',
  embarrassment: null,
  pressure_preference: PressurePreference.PRESSURE,
  cussing_ok: false,
  created_at: new Date(), updated_at: new Date(),
};

const testScore: ExecutionScore = {
  id: 'score-1', user_id: 'user-1', current_score: 68,
  completion_rate: 0.7, proof_rate: 0.6, response_time_score: 0.8, streak_bonus: 0.3,
  snapshot_date: new Date(), created_at: new Date(),
};

describe('CoachingService', () => {
  let service: CoachingService;
  let mockCreate: jest.Mock;
  let mockProfileRepo: any;
  let mockScoreRepo: any;
  let mockStrikeRepo: any;

  beforeEach(async () => {
    mockCreate = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'You said you fear staying stuck. What did you do today? Send proof.' }],
      usage: { input_tokens: 350, output_tokens: 40 },
    });

    // create()/save() are used to synthesize+persist a default profile when none exists.
    mockProfileRepo = {
      findOne: jest.fn().mockResolvedValue(testProfile),
      create: jest.fn((d: any) => d),
      save: jest.fn(async (d: any) => ({ id: 'profile-default', ...d })),
    };
    mockScoreRepo = { findOne: jest.fn().mockResolvedValue(testScore) };
    mockStrikeRepo = { count: jest.fn().mockResolvedValue(2) };
    const mockUserRepo = {
      findOne: jest.fn().mockResolvedValue(testUser),
      update: jest.fn().mockResolvedValue({}),
    };
    const mockCorrectionService = {
      getActiveKnowledge: jest.fn().mockResolvedValue([]),
    };

    const module = await Test.createTestingModule({
      providers: [
        CoachingService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(PsychologicalProfile), useValue: mockProfileRepo },
        { provide: getRepositoryToken(ExecutionScore), useValue: mockScoreRepo },
        { provide: getRepositoryToken(Strike), useValue: mockStrikeRepo },
        { provide: CorrectionService, useValue: mockCorrectionService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: any) => {
              if (key === 'AI_MODEL') return 'claude-haiku-4-5-20251001';
              if (key === 'BETA_MODE') return 'false';
              return def;
            }),
            getOrThrow: jest.fn(() => 'sk-ant-test'),
          },
        },
      ],
    }).compile();

    service = module.get<CoachingService>(CoachingService);
    (service as any).client = { messages: { create: mockCreate } };
  });

  it('loads the psychological profile for the user', async () => {
    await service.generateReply(testUser, [], 'How am I doing?');
    expect(mockProfileRepo.findOne).toHaveBeenCalledWith({
      where: { user_id: testUser.id },
    });
  });

  it('loads the latest execution score for the user', async () => {
    await service.generateReply(testUser, [], 'How am I doing?');
    expect(mockScoreRepo.findOne).toHaveBeenCalled();
  });

  it('loads recent strike count for the user', async () => {
    await service.generateReply(testUser, [], 'How am I doing?');
    expect(mockStrikeRepo.count).toHaveBeenCalled();
  });

  it('injects psychological profile into the system prompt', async () => {
    await service.generateReply(testUser, [], 'How am I doing?');
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).toContain(testProfile.fears);
    expect(callArgs.system).toContain(testProfile.comparison_figure);
  });

  it('injects execution score into the system prompt', async () => {
    await service.generateReply(testUser, [], 'How am I doing?');
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).toContain('68');
  });

  it('returns the reply text and token count', async () => {
    const result = await service.generateReply(testUser, [], 'Test');
    expect(result.reply).toContain('fear');
    expect(result.tokenCount).toBe(390);
  });

  it('works when no profile exists (falls back gracefully)', async () => {
    mockProfileRepo.findOne.mockResolvedValue(null);
    mockScoreRepo.findOne.mockResolvedValue(null);
    mockStrikeRepo.count.mockResolvedValue(0);
    await expect(service.generateReply(testUser, [], 'Hello')).resolves.toBeDefined();
  });

  it('forces a no-tools completion when the tool loop yields no text', async () => {
    // The model spends all 3 tool iterations calling tools without emitting text
    // (exhausts MAX_TOOL_ITERATIONS). runChat must then make ONE more call with
    // tools omitted to get a real reply, instead of returning empty.
    const toolResp = {
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 't1', name: 'noop', input: {} }],
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    mockCreate
      .mockResolvedValueOnce(toolResp)
      .mockResolvedValueOnce(toolResp)
      .mockResolvedValueOnce(toolResp)
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'still with you. what did you do today?' }],
        usage: { input_tokens: 20, output_tokens: 8 },
      });

    const result = await (service as any).runChat({
      systemPrompt: 'sys',
      recentMessages: [],
      incomingText: 'hey',
      tools: [{ name: 'noop' }],
      dispatch: async () => ({ ok: true }),
      userId: 'user-1',
      operationLabel: 'test',
    });

    expect(mockCreate).toHaveBeenCalledTimes(4);
    // The forced 4th call must omit tools so the model is made to produce text.
    expect(mockCreate.mock.calls[3][0].tools).toBeUndefined();
    expect(result.reply).toBe('still with you. what did you do today?');
  });

  it('includes conversation history in the messages array', async () => {
    const history: Message[] = [{
      id: 'm1', session_id: 's1', user_id: 'user-1',
      role: MessageRole.USER, message_type: MessageType.TEXT,
      content: 'I ran 1K yesterday', media_url: null,
      media_content_type: null, twilio_sid: null, token_count: null,
      is_checkin_prompt: false, is_proof_submission: false,
      flagged: false, flag_reason: null, created_at: new Date(),
    }];
    await service.generateReply(testUser, history, 'What next?');
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages.length).toBeGreaterThanOrEqual(2);
    expect(callArgs.messages[0].content).toBe('I ran 1K yesterday');
  });
});
