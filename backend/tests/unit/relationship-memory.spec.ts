import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { SummarisationService } from '../../src/ai/summarisation.service';
import { Message, MessageRole } from '../../src/data/entities/message.entity';
import { SessionSummary } from '../../src/data/entities/session-summary.entity';
import { ConversationSession } from '../../src/data/entities/conversation-session.entity';
import { User } from '../../src/data/entities/user.entity';

// Layer 2 — the persistent relationship digest. The non-negotiable property:
// a failed/empty merge must NEVER blank the memory KIBA already had (that was
// the amnesia failure mode of the old per-session summary path).
describe('SummarisationService.updateRelationshipMemory', () => {
  let service: SummarisationService;
  let mockCreate: jest.Mock;
  let userUpdate: jest.Mock;
  let messages: Message[];
  let userRow: Partial<User>;

  beforeEach(async () => {
    messages = [
      { role: MessageRole.USER, content: 'lost my job today man' } as Message,
      { role: MessageRole.AI, content: 'damn. that hits. what happened?' } as Message,
    ];
    userRow = { id: 'user-1', relationship_memory: 'Prior memory: anchor goal is 100k.' };
    mockCreate = jest.fn();
    userUpdate = jest.fn().mockResolvedValue({});

    const module = await Test.createTestingModule({
      providers: [
        SummarisationService,
        { provide: getRepositoryToken(Message), useValue: { find: jest.fn().mockResolvedValue(messages) } },
        { provide: getRepositoryToken(SessionSummary), useValue: { save: jest.fn() } },
        { provide: getRepositoryToken(ConversationSession), useValue: { update: jest.fn() } },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn().mockResolvedValue(userRow), update: userUpdate } },
        { provide: ConfigService, useValue: { get: jest.fn((k, d) => d), getOrThrow: jest.fn(() => 'sk-ant-test') } },
      ],
    }).compile();

    service = module.get(SummarisationService);
    (service as any).client = { messages: { create: mockCreate } };
  });

  it('writes the merged memory when the model returns text', async () => {
    // Call 1 = hard-fact extraction (NONE), Call 2 = digest merge.
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'NONE' }], usage: { input_tokens: 50, output_tokens: 2 } })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Marcus just lost his job; shaken. Anchor goal is 100k by Q4.' }],
        usage: { input_tokens: 200, output_tokens: 80 },
      });
    await service.updateRelationshipMemory('user-1', 'session-1');
    expect(userUpdate).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ relationship_memory: expect.stringContaining('lost his job') }),
    );
  });

  it('does NOT overwrite stored memory when the merge returns empty', async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'NONE' }], usage: { input_tokens: 50, output_tokens: 2 } })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '   ' }], usage: { input_tokens: 200, output_tokens: 0 } });
    await service.updateRelationshipMemory('user-1', 'session-1');
    expect(userUpdate).not.toHaveBeenCalledWith('user-1', expect.objectContaining({ relationship_memory: expect.anything() }));
  });

  it('appends new hard facts to the append-only notes list (Layer 3)', async () => {
    userRow.intake_data = { notes: ['Anchor goal is 100k'] } as any;
    mockCreate
      // extraction call returns a new durable fact
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '- Dad passed away March 2026' }], usage: { input_tokens: 80, output_tokens: 10 } })
      // digest merge
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'digest text' }], usage: { input_tokens: 200, output_tokens: 80 } });
    await service.updateRelationshipMemory('user-1', 'session-1');
    expect(userUpdate).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        intake_data: expect.objectContaining({ notes: ['Anchor goal is 100k', 'Dad passed away March 2026'] }),
      }),
    );
  });

  it('does not duplicate a hard fact that is already stored', async () => {
    userRow.intake_data = { notes: ['Dad passed away March 2026'] } as any;
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'dad passed away march 2026' }], usage: { input_tokens: 80, output_tokens: 10 } })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'digest text' }], usage: { input_tokens: 200, output_tokens: 80 } });
    await service.updateRelationshipMemory('user-1', 'session-1');
    expect(userUpdate).not.toHaveBeenCalledWith('user-1', expect.objectContaining({ intake_data: expect.anything() }));
  });

  it('does not write for an empty session (no messages)', async () => {
    const emptyModule = await Test.createTestingModule({
      providers: [
        SummarisationService,
        { provide: getRepositoryToken(Message), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(SessionSummary), useValue: { save: jest.fn() } },
        { provide: getRepositoryToken(ConversationSession), useValue: { update: jest.fn() } },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn(), update: userUpdate } },
        { provide: ConfigService, useValue: { get: jest.fn((k, d) => d), getOrThrow: jest.fn(() => 'sk-ant-test') } },
      ],
    }).compile();
    const emptyService = emptyModule.get<SummarisationService>(SummarisationService);
    (emptyService as any).client = { messages: { create: mockCreate } };
    await emptyService.updateRelationshipMemory('user-1', 'session-1');
    expect(mockCreate).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });
});
