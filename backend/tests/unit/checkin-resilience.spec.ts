import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { CheckinProcessor } from '../../src/accountability/checkin.processor';
import { User, UserStatus, OnboardingStage } from '../../src/data/entities/user.entity';
import { PsychologicalProfile } from '../../src/data/entities/psychological-profile.entity';
import { Message } from '../../src/data/entities/message.entity';
import { MessagingService } from '../../src/messaging/messaging.service';
import { SessionBoundaryService } from '../../src/data/session-boundary.service';
import { AntiGhostService } from '../../src/accountability/anti-ghost.service';
import { ScheduleService } from '../../src/accountability/schedule.service';
import { CheckinService } from '../../src/accountability/checkin.service';
import { TaskService } from '../../src/accountability/task.service';
import { SurpriseService } from '../../src/accountability/surprise.service';
import { RecapService } from '../../src/accountability/recap.service';
import { StripeService } from '../../src/onboarding/stripe.service';
import { CoachingService } from '../../src/ai/coaching.service';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';

/** QueryBuilder stub for the atomic once-per-day claim. affected=1 → claim wins. */
function claimQB(affected = 1) {
  return {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected }),
  };
}

/**
 * Regression net for the prod outage where daily check-ins silently stopped
 * for every user. Root cause: messagingService.send threw on a single call,
 * the exception bubbled out of handleSendCheckin, BullMQ marked the job failed,
 * and the self-re-enqueue at the bottom of the handler never ran. From that
 * point forward the user had no scheduled jobs and never got another check-in.
 *
 * The contract this suite guards: when send throws, the chain still re-enqueues.
 */
describe('CheckinProcessor.handleSendCheckin — resilience', () => {
  let processor: CheckinProcessor;
  let userRepo: { findOne: jest.Mock };
  let profileRepo: { findOne: jest.Mock };
  let messageRepo: { save: jest.Mock };
  let messagingService: { send: jest.Mock };
  let sessionBoundary: { checkAndHandle: jest.Mock; recordMessage: jest.Mock };
  let scheduleService: { fire: jest.Mock };
  let checkinService: { scheduleCheckin: jest.Mock; scheduleAllCheckins: jest.Mock };
  let taskService: { ensureTodayTask: jest.Mock };
  let antiGhostService: { onMissedCheckin: jest.Mock };
  let queue: { add: jest.Mock };

  const completeUser = {
    id: 'u-1',
    phone_number: '+15551234567',
    name: 'Alex',
    status: UserStatus.TRIAL,
    onboarding_stage: OnboardingStage.COMPLETE,
    crisis_hold: false,
    checkin_time: '09:00',
    utc_offset_minutes: -300,
  } as unknown as User;

  beforeEach(async () => {
    userRepo = {
      findOne: jest.fn().mockResolvedValue(completeUser),
      // Atomic per-day check-in claim (createQueryBuilder().update()...execute()).
      createQueryBuilder: jest.fn(() => claimQB(1)),
    } as any;
    profileRepo = { findOne: jest.fn().mockResolvedValue(null) };
    messageRepo = { save: jest.fn().mockResolvedValue({ id: 'm-1' }) };
    messagingService = { send: jest.fn().mockResolvedValue(undefined) };
    sessionBoundary = {
      checkAndHandle: jest.fn().mockResolvedValue({ sessionId: 's-1', isNewSession: false, minutesSinceLastMessage: 0, shouldSummarise: false }),
      recordMessage: jest.fn().mockResolvedValue(undefined),
    };
    scheduleService = { fire: jest.fn().mockResolvedValue(undefined) };
    checkinService = {
      scheduleCheckin: jest.fn().mockResolvedValue(undefined),
      scheduleAllCheckins: jest.fn().mockResolvedValue(undefined),
    };
    taskService = { ensureTodayTask: jest.fn().mockResolvedValue(null) };
    antiGhostService = { onMissedCheckin: jest.fn().mockResolvedValue(undefined) };
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-x' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckinProcessor,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(PsychologicalProfile), useValue: profileRepo },
        { provide: getRepositoryToken(Message), useValue: messageRepo },
        { provide: MessagingService, useValue: messagingService },
        { provide: SessionBoundaryService, useValue: sessionBoundary },
        { provide: AntiGhostService, useValue: antiGhostService },
        { provide: ScheduleService, useValue: scheduleService },
        { provide: CheckinService, useValue: checkinService },
        { provide: TaskService, useValue: taskService },
        { provide: SurpriseService, useValue: { fire: jest.fn(), scheduleWeek: jest.fn() } },
        { provide: RecapService, useValue: { fire: jest.fn(), scheduleAllRecaps: jest.fn(), scheduleRecap: jest.fn() } },
        { provide: StripeService, useValue: { createCustomer: jest.fn(), createCheckoutSession: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn((_k: string, d?: unknown) => d), getOrThrow: jest.fn(() => 'price_test') } },
        { provide: CoachingService, useValue: { generateWinbackNudge: jest.fn().mockResolvedValue(null) } },
        { provide: getQueueToken('accountability'), useValue: queue },
      ],
    }).compile();

    processor = module.get<CheckinProcessor>(CheckinProcessor);
  });

  function makeJob(): Job {
    return { id: 'j-1', data: { userId: 'u-1' } } as unknown as Job;
  }

  it('re-enqueues tomorrow even when send throws (the prod outage we just fixed)', async () => {
    messagingService.send.mockRejectedValueOnce(new Error('twilio 500'));
    await processor.handleSendCheckin(makeJob());
    expect(messagingService.send).toHaveBeenCalledTimes(1);
    expect(checkinService.scheduleCheckin).toHaveBeenCalledWith(completeUser);
  });

  it('does not throw out of the handler when send fails (would cause BullMQ to mark failed)', async () => {
    messagingService.send.mockRejectedValueOnce(new Error('sendblue throttled'));
    await expect(processor.handleSendCheckin(makeJob())).resolves.toBeUndefined();
  });

  it('skips the missed-checkin timer when send failed (no point alerting on a checkin the user never got)', async () => {
    taskService.ensureTodayTask.mockResolvedValueOnce({ id: 't-1', task_description: 'run 5k' });
    messagingService.send.mockRejectedValueOnce(new Error('boom'));
    await processor.handleSendCheckin(makeJob());
    const missedCalls = queue.add.mock.calls.filter((c) => c[0] === 'checkin-missed');
    expect(missedCalls).toHaveLength(0);
    // But re-enqueue still happens
    expect(checkinService.scheduleCheckin).toHaveBeenCalled();
  });

  it('writes a Message row with is_checkin_prompt=true so admin API can see it', async () => {
    await processor.handleSendCheckin(makeJob());
    expect(messageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u-1',
        role: 'ai',
        is_checkin_prompt: true,
      }),
    );
  });

  it('re-enqueues even if Message row insert fails (visibility is best-effort, cadence is not)', async () => {
    messageRepo.save.mockRejectedValueOnce(new Error('db lag'));
    await processor.handleSendCheckin(makeJob());
    expect(checkinService.scheduleCheckin).toHaveBeenCalled();
  });

  it('survives a re-enqueue throw — log and move on (one bad user must not stop the queue worker)', async () => {
    checkinService.scheduleCheckin.mockRejectedValueOnce(new Error('redis down'));
    await expect(processor.handleSendCheckin(makeJob())).resolves.toBeUndefined();
  });

  it('crisis_hold: skips send + Message write, still re-enqueues tomorrow', async () => {
    userRepo.findOne.mockResolvedValueOnce({ ...completeUser, crisis_hold: true });
    await processor.handleSendCheckin(makeJob());
    expect(messagingService.send).not.toHaveBeenCalled();
    expect(messageRepo.save).not.toHaveBeenCalled();
    expect(checkinService.scheduleCheckin).toHaveBeenCalled();
  });

  it('cancelled user: stops the chain (no send, no re-enqueue)', async () => {
    userRepo.findOne.mockResolvedValueOnce({ ...completeUser, status: UserStatus.CANCELLED });
    await processor.handleSendCheckin(makeJob());
    expect(messagingService.send).not.toHaveBeenCalled();
    expect(checkinService.scheduleCheckin).not.toHaveBeenCalled();
  });
});

describe('CheckinProcessor.handleSafetyReschedule', () => {
  it('delegates to scheduleAllCheckins so the hourly cron can self-heal cadence', async () => {
    const checkinService = { scheduleAllCheckins: jest.fn().mockResolvedValue(undefined) } as unknown as CheckinService;
    const recapService = { scheduleAllRecaps: jest.fn().mockResolvedValue(undefined) };
    // Positional args mirror the constructor: …, checkinService(8), taskService(9),
    // surpriseService(10), recapService(11).
    const processor = new (CheckinProcessor as any)(
      {}, {}, {}, {}, {}, {}, {}, checkinService, {}, {}, recapService,
    );
    await processor.handleSafetyReschedule();
    expect(checkinService.scheduleAllCheckins).toHaveBeenCalledTimes(1);
    expect(recapService.scheduleAllRecaps).toHaveBeenCalledTimes(1);
  });
});
