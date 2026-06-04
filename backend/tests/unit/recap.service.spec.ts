import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { RecapService } from '../../src/accountability/recap.service';
import { User, UserStatus, OnboardingStage } from '../../src/data/entities/user.entity';
import { DailyTodo, DailyTodoStatus } from '../../src/data/entities/daily-todo.entity';
import { Proof } from '../../src/data/entities/proof.entity';
import { Message } from '../../src/data/entities/message.entity';
import { ScoreService } from '../../src/accountability/score.service';
import { MessagingService } from '../../src/messaging/messaging.service';
import { SessionBoundaryService } from '../../src/data/session-boundary.service';

/** Atomic per-day claim stub. affected=1 → this fire wins and sends. */
function claimQB(affected = 1) {
  return {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected }),
  };
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    phone_number: '+15551234567',
    name: 'Alex',
    status: UserStatus.ACTIVE,
    onboarding_stage: OnboardingStage.COMPLETE,
    crisis_hold: false,
    utc_offset_minutes: -300,
    last_excuse_phrase: null,
    same_excuse_count: 0,
    ...overrides,
  } as unknown as User;
}

const doneTodo = { content: 'leg workout', status: DailyTodoStatus.DONE } as DailyTodo;
const openTodo = { content: 'business deep work', status: DailyTodoStatus.OPEN } as DailyTodo;

describe('RecapService.fire', () => {
  let service: RecapService;
  let userRepo: any;
  let todoRepo: any;
  let proofRepo: any;
  let messageRepo: any;
  let messaging: any;
  let queue: any;
  let claimAffected: number;

  beforeEach(async () => {
    claimAffected = 1;
    userRepo = {
      findOne: jest.fn().mockResolvedValue(makeUser()),
      createQueryBuilder: jest.fn(() => claimQB(claimAffected)),
    };
    todoRepo = { find: jest.fn().mockResolvedValue([doneTodo, openTodo]) };
    proofRepo = { count: jest.fn().mockResolvedValue(2) };
    messageRepo = { save: jest.fn().mockResolvedValue({ id: 'm-1' }) };
    messaging = { send: jest.fn().mockResolvedValue(undefined) };
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    const scoreService = { updateScore: jest.fn().mockResolvedValue({ current_score: 72 }) };
    const sessionBoundary = {
      checkAndHandle: jest.fn().mockResolvedValue({ sessionId: 's-1' }),
      recordMessage: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecapService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(DailyTodo), useValue: todoRepo },
        { provide: getRepositoryToken(Proof), useValue: proofRepo },
        { provide: getRepositoryToken(Message), useValue: messageRepo },
        { provide: ScoreService, useValue: scoreService },
        { provide: MessagingService, useValue: messaging },
        { provide: SessionBoundaryService, useValue: sessionBoundary },
        { provide: getQueueToken('accountability'), useValue: queue },
      ],
    }).compile();

    service = module.get<RecapService>(RecapService);
  });

  it('sends a recap built from the day’s todos and self-reschedules tomorrow', async () => {
    await service.fire('user-1');

    expect(messaging.send).toHaveBeenCalledTimes(1);
    const [, body] = messaging.send.mock.calls[0];
    expect(body).toContain('day recap:');
    expect(body).toContain('✅ leg workout');
    expect(body).toContain('❌ business deep work');
    expect(messageRepo.save).toHaveBeenCalled(); // persisted for admin visibility
    expect(queue.add).toHaveBeenCalledWith(
      'send-recap',
      { userId: 'user-1' },
      expect.objectContaining({ jobId: expect.stringContaining('recap:user-1:') }),
    );
  });

  it('suppresses the send when the day is already claimed, but still reschedules', async () => {
    claimAffected = 0;
    await service.fire('user-1');

    expect(messaging.send).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledTimes(1); // reschedule only
  });

  it('stays silent when there was nothing on the board, but still reschedules', async () => {
    todoRepo.find.mockResolvedValue([]);
    await service.fire('user-1');

    expect(messaging.send).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('suppresses tonight’s send for a crisis-hold user, keeping cadence', async () => {
    userRepo.findOne.mockResolvedValue(makeUser({ crisis_hold: true }));
    await service.fire('user-1');

    expect(messaging.send).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('stops the loop entirely for a cancelled user (no send, no reschedule)', async () => {
    userRepo.findOne.mockResolvedValue(makeUser({ status: UserStatus.CANCELLED }));
    await service.fire('user-1');

    expect(messaging.send).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
