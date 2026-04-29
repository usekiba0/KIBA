import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CoachingService } from '../../src/ai/coaching.service';
import { User, CoachingFocus, UserStatus } from '../../src/data/entities/user.entity';
import { Message, MessageRole, MessageType } from '../../src/data/entities/message.entity';

describe('CoachingService Unit Tests', () => {
  let service: CoachingService;

  const mockConfig = {
    get: jest.fn((key: string, def?: unknown) => {
      if (key === 'AI_MODEL') return 'claude-haiku-4-5-20251001';
      return def;
    }),
    getOrThrow: jest.fn(() => 'sk-ant-test'),
  };

  const testUser: User = {
    id: 'user-1',
    phone_number: '+15551234567',
    name: 'Alex',
    coaching_focus: CoachingFocus.FITNESS,
    goals: 'Build a consistent workout habit',
    height_cm: 178,
    weight_kg: 80,
    age: 28,
    health_conditions: [],
    dietary_restrictions: [],
    injuries: null,
    status: UserStatus.TRIAL,
    crisis_hold: false,
    registered_at: new Date(),
    last_active_at: null,
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CoachingService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get(CoachingService);
  });

  it('should call Claude API and return a reply with token count', async () => {
    const mockReply = 'Great job on the workout! For tomorrow, try adding 5 more minutes to your run. How are you feeling about the progress so far?';

    (service as any).client = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: mockReply }],
          usage: { input_tokens: 200, output_tokens: 35 },
        }),
      },
    };

    const result = await service.generateReply(testUser, [], 'I completed my workout today!');

    expect(result.reply).toBe(mockReply);
    expect(result.tokenCount).toBe(235);
  });

  it('should include user name and goals in system prompt', async () => {
    let capturedSystem = '';
    (service as any).client = {
      messages: {
        create: jest.fn().mockImplementation(async (params: any) => {
          capturedSystem = params.system;
          return { content: [{ type: 'text', text: 'reply' }], usage: { input_tokens: 100, output_tokens: 10 } };
        }),
      },
    };

    await service.generateReply(testUser, [], 'test message');

    expect(capturedSystem).toContain('Alex');
    expect(capturedSystem).toContain('Build a consistent workout habit');
    expect(capturedSystem).toContain('fitness');
  });

  it('should include session summary in system prompt when provided', async () => {
    let capturedSystem = '';
    (service as any).client = {
      messages: {
        create: jest.fn().mockImplementation(async (params: any) => {
          capturedSystem = params.system;
          return { content: [{ type: 'text', text: 'reply' }], usage: { input_tokens: 100, output_tokens: 10 } };
        }),
      },
    };

    await service.generateReply(testUser, [], 'test', 'User ran 5km three times last week.');

    expect(capturedSystem).toContain('User ran 5km three times last week');
  });

  it('should include recent messages in the messages array', async () => {
    let capturedMessages: any[] = [];
    (service as any).client = {
      messages: {
        create: jest.fn().mockImplementation(async (params: any) => {
          capturedMessages = params.messages;
          return { content: [{ type: 'text', text: 'reply' }], usage: { input_tokens: 100, output_tokens: 10 } };
        }),
      },
    };

    const history: Message[] = [
      { id: 'm1', session_id: 's1', user_id: 'user-1', role: MessageRole.USER, message_type: MessageType.TEXT, content: 'Previous message', created_at: new Date(), media_url: null, media_content_type: null, twilio_sid: null, token_count: null },
    ];

    await service.generateReply(testUser, history, 'New message');

    // History + new message
    expect(capturedMessages).toHaveLength(2);
    expect(capturedMessages[0]).toEqual({ role: 'user', content: 'Previous message' });
    expect(capturedMessages[1]).toEqual({ role: 'user', content: 'New message' });
  });
});
