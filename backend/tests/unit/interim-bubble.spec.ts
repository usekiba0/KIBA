import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { CoachingService } from '../../src/ai/coaching.service';
import { User } from '../../src/data/entities/user.entity';
import { PsychologicalProfile } from '../../src/data/entities/psychological-profile.entity';
import { ExecutionScore } from '../../src/data/entities/execution-score.entity';
import { Strike } from '../../src/data/entities/strike.entity';
import { DailyTask } from '../../src/data/entities/daily-task.entity';
import { CorrectionService } from '../../src/data/correction.service';

/**
 * The early-bubble path: when the model opens a tool turn with a line of its
 * own, that line reaches the user IMMEDIATELY instead of after the tool
 * round-trip — which is what made tool-using turns feel like 10+ seconds of
 * silence (Karibi 2026-07-28).
 *
 * Both halves of the contract matter: it must get sent, and it must not get
 * said twice.
 */

const usage = { input_tokens: 10, output_tokens: 5 };
const textBlock = (text: string) => ({ type: 'text', text });
const toolBlock = () => ({
  type: 'tool_use',
  id: 'tu_1',
  name: 'add_todo',
  input: { content: 'run 5k' },
});

describe('CoachingService — interim bubble before the tool round-trip', () => {
  let service: CoachingService;
  let mockCreate: jest.Mock;

  beforeEach(async () => {
    mockCreate = jest.fn();

    const module = await Test.createTestingModule({
      providers: [
        CoachingService,
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(PsychologicalProfile), useValue: {} },
        { provide: getRepositoryToken(ExecutionScore), useValue: {} },
        { provide: getRepositoryToken(Strike), useValue: {} },
        { provide: getRepositoryToken(DailyTask), useValue: {} },
        { provide: CorrectionService, useValue: {} },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: unknown) =>
              key === 'AI_MODEL' ? 'claude-haiku-4-5-20251001' : def,
            ),
            getOrThrow: jest.fn(() => 'sk-ant-test'),
          },
        },
      ],
    }).compile();

    service = module.get<CoachingService>(CoachingService);
    (service as any).client = { messages: { create: mockCreate } };
  });

  // runChat is private. Exercising it directly keeps these tests on the behavior
  // under change rather than on generateReply's large DB-context surface.
  const runChat = (over: Record<string, unknown> = {}) =>
    (service as any).runChat({
      systemPrompt: 'sys',
      recentMessages: [],
      incomingText: 'add a 5k run',
      userId: 'u1',
      operationLabel: 'coaching_reply',
      tools: [{ name: 'add_todo' }],
      dispatch: async () => ({ ok: true }),
      ...over,
    }) as Promise<{ reply: string }>;

  const toolThen = (finalText: string, preamble = 'bet, locking that in') => {
    mockCreate
      .mockResolvedValueOnce({
        content: [textBlock(preamble), toolBlock()],
        stop_reason: 'tool_use',
        usage,
      })
      .mockResolvedValueOnce({
        content: [textBlock(finalText)],
        stop_reason: 'end_turn',
        usage,
      });
  };

  it('sends the pre-tool line before the tools run', async () => {
    const order: string[] = [];
    toolThen("done, it's on your list");

    const result = await runChat({
      dispatch: async () => {
        order.push('tool');
        return { ok: true };
      },
      onInterimText: async (t: string) => {
        order.push(`interim:${t}`);
      },
    });

    // The whole point: the user hears something BEFORE the tool executes.
    expect(order).toEqual(['interim:bet, locking that in', 'tool']);
    expect(result.reply).toBe("done, it's on your list");
  });

  it('strips the interim line when the model restates it', async () => {
    toolThen("bet, locking that in. done, it's on your list");
    const result = await runChat({ onInterimText: async () => undefined });
    expect(result.reply).toBe("done, it's on your list");
  });

  it('returns empty — and does NOT retry — when the final reply only repeats it', async () => {
    toolThen('bet, locking that in');
    const result = await runChat({ onInterimText: async () => undefined });

    expect(result.reply).toBe('');
    // No forced-text retries: the user already heard a complete reply, and
    // retrying would both re-say it and add back the latency this removes.
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('skips a fragment too short to stand alone as its own bubble', async () => {
    const seen: string[] = [];
    toolThen('locked in', 'ok');

    await runChat({
      onInterimText: async (t: string) => {
        seen.push(t);
      },
    });

    expect(seen).toEqual([]);
  });

  it('is a no-op when no callback is supplied (unchanged behavior)', async () => {
    toolThen("done, it's on your list");
    const result = await runChat();
    expect(result.reply).toBe("done, it's on your list");
  });

  it('never blocks the turn when the early send throws', async () => {
    toolThen("done, it's on your list");
    const result = await runChat({
      onInterimText: async () => {
        throw new Error('sendblue down');
      },
    });
    // Reply still lands, and since nothing was actually delivered the restated
    // text is NOT stripped — the user must still hear it.
    expect(result.reply).toBe("done, it's on your list");
  });
});
