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

  // Bug 1 (Ali/Sam transcript): the model finished a turn on a save_intake_field
  // tool call with NO text, and the first forced retry ALSO came back empty, so the
  // processor pasted the canned "still with you on…" fallback. The forced retry now
  // appends an explicit "reply now" nudge and retries, so it never leaves empty.
  it('retries the forced completion with a reply nudge when the first comes back empty', async () => {
    const toolResp = {
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 't1', name: 'noop', input: {} }],
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    const emptyResp = { stop_reason: 'end_turn', content: [{ type: 'text', text: '   ' }], usage: { input_tokens: 5, output_tokens: 1 } };
    mockCreate
      .mockResolvedValueOnce(toolResp) // iter 0: tool call, no text
      .mockResolvedValueOnce(emptyResp) // iter 1: ends turn with no text -> loop breaks empty
      .mockResolvedValueOnce(emptyResp) // forced retry 1 -> still empty
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'okay 50k, halfway there. which one is closer?' }], usage: { input_tokens: 20, output_tokens: 9 } }); // forced retry 2 -> text

    const result = await (service as any).runChat({
      systemPrompt: 'sys', recentMessages: [], incomingText: 'around 50k a month',
      tools: [{ name: 'noop' }], dispatch: async () => ({ ok: true }),
      userId: 'user-1', operationLabel: 'test',
    });

    // The forced retries (calls 3 & 4) omit tools and append the "reply now" nudge.
    const forcedCall = mockCreate.mock.calls[2][0];
    expect(forcedCall.tools).toBeUndefined();
    const lastMsg = forcedCall.messages[forcedCall.messages.length - 1];
    expect(lastMsg.role).toBe('user');
    expect(String(lastMsg.content)).toMatch(/reply to the user/i);
    expect(result.reply).toBe('okay 50k, halfway there. which one is closer?');
  });

  // RC-1 regression: the coaching dispatch used to gate on fire_at_iso and
  // silently reject every delay_minutes / local_clock reminder the model sent
  // (the schema tells it to PREFER those), making the model improvise "system's
  // being weird". These lock the dispatch to forward whichever param it got.
  // Multi-image (Karibi 2026-06-25): KIBA sees all the photos in one reply, not
  // one-per-photo. runChat builds an image block per URL, capped at 4.
  describe('runChat multi-image', () => {
    beforeEach(() => {
      (service as any).prepareImageBlock = jest.fn(async () => ({
        ok: true, block: { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'x' } },
      }));
    });

    it('builds one image block per image in a single user message', async () => {
      mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'nice shots' }], usage: { input_tokens: 10, output_tokens: 5 } });
      const result = await (service as any).runChat({
        systemPrompt: 'sys', recentMessages: [], incomingText: 'check these',
        imageUrls: ['a.jpg', 'b.jpg', 'c.jpg'], imageContentTypes: ['image/jpeg', 'image/jpeg', 'image/jpeg'],
        userId: 'u1', operationLabel: 'test',
      });
      const sent = mockCreate.mock.calls[0][0];
      const last = sent.messages[sent.messages.length - 1];
      const imageBlocks = (last.content as Array<{ type: string }>).filter((b) => b.type === 'image');
      expect(imageBlocks.length).toBe(3);
      expect(result.reply).toBe('nice shots');
    });

    it('caps at 4 images even when more are sent', async () => {
      mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'got all of those' }], usage: { input_tokens: 10, output_tokens: 5 } });
      await (service as any).runChat({
        systemPrompt: 'sys', recentMessages: [], incomingText: '',
        imageUrls: ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg', '6.jpg'],
        imageContentTypes: ['image/jpeg', 'image/jpeg', 'image/jpeg', 'image/jpeg', 'image/jpeg', 'image/jpeg'],
        userId: 'u1', operationLabel: 'test',
      });
      const sent = mockCreate.mock.calls[0][0];
      const last = sent.messages[sent.messages.length - 1];
      const imageBlocks = (last.content as Array<{ type: string }>).filter((b) => b.type === 'image');
      expect(imageBlocks.length).toBe(4);
    });
  });

  describe('dispatchCoachingTool — schedule_reminder', () => {
    function makeHandlers() {
      return {
        scheduleReminder: jest.fn().mockResolvedValue({
          ok: true, reminder_id: 'r1', fire_at_iso: '2026-06-24T13:30:00.000Z', fires_in: '8 hours',
        }),
      } as any;
    }

    it('forwards local_clock (no fire_at_iso) to scheduleReminder', async () => {
      const handlers = makeHandlers();
      const block = { type: 'tool_use', id: 't1', name: 'schedule_reminder',
        input: { local_clock: '08:30', message: 'do the telegram bot' } };
      const result = await (service as any).dispatchCoachingTool(block, handlers, 'user-1');
      expect(handlers.scheduleReminder).toHaveBeenCalledWith(
        expect.objectContaining({ local_clock: '08:30', message: 'do the telegram bot' }),
      );
      expect((result as any).ok).toBe(true);
    });

    it('forwards delay_minutes (no fire_at_iso) to scheduleReminder', async () => {
      const handlers = makeHandlers();
      const block = { type: 'tool_use', id: 't2', name: 'schedule_reminder',
        input: { delay_minutes: 5, message: 'stretch' } };
      const result = await (service as any).dispatchCoachingTool(block, handlers, 'user-1');
      expect(handlers.scheduleReminder).toHaveBeenCalledWith(
        expect.objectContaining({ delay_minutes: 5, message: 'stretch' }),
      );
      expect((result as any).ok).toBe(true);
    });

    it('forwards a daily recurrence with local_clock', async () => {
      const handlers = makeHandlers();
      const block = { type: 'tool_use', id: 't3', name: 'schedule_reminder',
        input: { local_clock: '07:00', message: 'wake up', recurrence: { rule: 'daily', local_time: '07:00' } } };
      await (service as any).dispatchCoachingTool(block, handlers, 'user-1');
      expect(handlers.scheduleReminder).toHaveBeenCalledWith(
        expect.objectContaining({ recurrence: { rule: 'daily', local_time: '07:00' } }),
      );
    });

    it('rejects only when message is missing/empty — never for a missing fire_at_iso', async () => {
      const handlers = makeHandlers();
      const block = { type: 'tool_use', id: 't4', name: 'schedule_reminder',
        input: { local_clock: '08:30' } };
      const result = await (service as any).dispatchCoachingTool(block, handlers, 'user-1');
      expect((result as any).ok).toBe(false);
      expect(handlers.scheduleReminder).not.toHaveBeenCalled();
    });
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
