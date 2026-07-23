import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { ScheduleService } from '../../src/accountability/schedule.service';
import {
  ScheduledReminder,
  ScheduledReminderStatus,
  ReminderRecurrence,
} from '../../src/data/entities/scheduled-reminder.entity';
import { User } from '../../src/data/entities/user.entity';
import { MessagingService } from '../../src/messaging/messaging.service';
import { OutboundRecorderService } from '../../src/data/outbound-recorder.service';

// Forensics + chain-survival semantics for cancel() (Karibi 2026-07-22: all
// three of his daily chains died when their pending rows were cancelled
// out-of-band — cancel() logged nothing, recorded no actor, and the chain
// re-arm only ran on fire, so a single cancel killed each chain forever).
describe('ScheduleService cancel semantics', () => {
  let service: ScheduleService;
  let reminderRepo: { save: jest.Mock; find: jest.Mock; findOne: jest.Mock; update: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let queue: { add: jest.Mock; getJob: jest.Mock };
  let messagingService: { send: jest.Mock };
  let recorder: { record: jest.Mock };

  const pendingOneShot = {
    id: 'rem-1',
    user_id: 'u-1',
    status: ScheduledReminderStatus.PENDING,
    bull_job_id: 'job-1',
    message: 'tailor time. pick up the clothes.',
    fire_at: new Date(Date.now() + 60 * 60_000),
    recurrence_rule: null,
    recurrence_local_time: null,
    recurrence_offset_minutes: null,
    recurrence_iana_timezone: null,
    recurrence_parent_id: null,
  } as unknown as ScheduledReminder;

  const pendingDaily = {
    ...pendingOneShot,
    id: 'rem-d1',
    message: 'gym time. what are you hitting today?',
    recurrence_rule: ReminderRecurrence.DAILY,
    recurrence_local_time: '09:00',
    recurrence_offset_minutes: -300,
    recurrence_iana_timezone: 'America/Chicago',
    recurrence_parent_id: 'parent-1',
  } as unknown as ScheduledReminder;

  beforeEach(async () => {
    recorder = { record: jest.fn().mockResolvedValue(undefined) };
    reminderRepo = {
      save: jest.fn().mockImplementation(async (row) => ({ id: 'rem-new', ...row })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    };
    userRepo = { findOne: jest.fn() };
    queue = {
      add: jest.fn().mockResolvedValue({ id: 'job-new' }),
      getJob: jest.fn().mockResolvedValue(null),
    };
    messagingService = { send: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleService,
        { provide: getRepositoryToken(ScheduledReminder), useValue: reminderRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getQueueToken('accountability'), useValue: queue },
        { provide: MessagingService, useValue: messagingService },
        { provide: OutboundRecorderService, useValue: recorder },
      ],
    }).compile();

    service = module.get<ScheduleService>(ScheduleService);
  });

  it('records the actor in failure_reason so a cancel is never anonymous', async () => {
    reminderRepo.findOne.mockResolvedValue({ ...pendingOneShot });

    await service.cancel('rem-1', { actor: 'admin' });

    expect(reminderRepo.update).toHaveBeenCalledWith(
      'rem-1',
      expect.objectContaining({
        status: ScheduledReminderStatus.CANCELLED,
        failure_reason: expect.stringContaining('admin'),
      }),
    );
  });

  it('prefers an explicit reason over the actor default', async () => {
    reminderRepo.findOne.mockResolvedValue({ ...pendingOneShot });

    await service.cancel('rem-1', { actor: 'supersede', reason: 'superseded by rem-new' });

    expect(reminderRepo.update).toHaveBeenCalledWith(
      'rem-1',
      expect.objectContaining({
        failure_reason: 'superseded by rem-new',
      }),
    );
  });

  it('cancelling one occurrence of a daily chain re-arms tomorrow (skip, not kill)', async () => {
    reminderRepo.findOne.mockResolvedValue({ ...pendingDaily });

    await service.cancel('rem-d1', { actor: 'admin' });

    // This occurrence is cancelled…
    expect(reminderRepo.update).toHaveBeenCalledWith(
      'rem-d1',
      expect.objectContaining({
        status: ScheduledReminderStatus.CANCELLED,
      }),
    );
    // …but the chain survives: the next occurrence is persisted and enqueued
    // with the same parent so the series stays one chain.
    expect(reminderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        message: pendingDaily.message,
        recurrence_rule: ReminderRecurrence.DAILY,
        recurrence_local_time: '09:00',
        recurrence_parent_id: 'parent-1',
        status: ScheduledReminderStatus.PENDING,
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'send-scheduled-reminder',
      { reminderId: 'rem-new' },
      expect.objectContaining({ delay: expect.any(Number) }),
    );
  });

  it('killChain stops a daily chain without re-arming', async () => {
    reminderRepo.findOne.mockResolvedValue({ ...pendingDaily });

    await service.cancel('rem-d1', { actor: 'ai_tool', killChain: true });

    expect(reminderRepo.update).toHaveBeenCalledWith(
      'rem-d1',
      expect.objectContaining({
        status: ScheduledReminderStatus.CANCELLED,
      }),
    );
    expect(reminderRepo.save).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('cancelSeries kills every pending row in the chain with no re-arm', async () => {
    const rowA = { ...pendingDaily, id: 'rem-d1' };
    const rowB = { ...pendingDaily, id: 'rem-d2' };
    reminderRepo.find.mockResolvedValue([rowA, rowB]);
    // Mirror the DB: once update() has cancelled a row, the re-read returns it
    // as CANCELLED (cancel() counts off the re-read).
    const cancelledIds = new Set<string>();
    reminderRepo.update.mockImplementation(async (id: string) => {
      cancelledIds.add(id);
      return {};
    });
    reminderRepo.findOne.mockImplementation(async ({ where }: any) => {
      const row = where.id === 'rem-d1' ? rowA : where.id === 'rem-d2' ? rowB : null;
      if (!row) return null;
      return cancelledIds.has(row.id) ? { ...row, status: ScheduledReminderStatus.CANCELLED } : row;
    });

    const count = await service.cancelSeries('parent-1', { actor: 'ai_tool' });

    expect(count).toBe(2);
    expect(reminderRepo.update).toHaveBeenCalledWith(
      'rem-d1',
      expect.objectContaining({
        status: ScheduledReminderStatus.CANCELLED,
        failure_reason: expect.stringContaining('ai_tool'),
      }),
    );
    expect(reminderRepo.update).toHaveBeenCalledWith(
      'rem-d2',
      expect.objectContaining({
        status: ScheduledReminderStatus.CANCELLED,
      }),
    );
    expect(reminderRepo.save).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});

// Same-minute duplicate one-shots (Karibi 2026-07-23: a typo re-confirm made
// the model schedule the tailor pickup twice, 16s apart, worded differently —
// reminderSignature covers only the structured pre/proof shapes, so nothing
// superseded and both fired at 10am).
describe('ScheduleService enqueue — same-minute same-intent supersede', () => {
  let service: ScheduleService;
  let reminderRepo: { save: jest.Mock; find: jest.Mock; findOne: jest.Mock; update: jest.Mock };
  let queue: { add: jest.Mock; getJob: jest.Mock };

  const fireAt = new Date(Date.now() + 12 * 60 * 60_000);

  const olderDup = {
    id: 'rem-old',
    user_id: 'u-1',
    status: ScheduledReminderStatus.PENDING,
    bull_job_id: 'job-old',
    message:
      'yo. tailor time. go pick up those clothes and send proof when you got em. pic of the clothes or receipt.',
    fire_at: fireAt,
    recurrence_rule: null,
    recurrence_parent_id: null,
    created_at: new Date(),
  } as unknown as ScheduledReminder;

  beforeEach(async () => {
    reminderRepo = {
      save: jest.fn().mockImplementation(async (row) => ({ id: 'rem-new', ...row })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    };
    queue = {
      add: jest.fn().mockResolvedValue({ id: 'job-new' }),
      getJob: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleService,
        { provide: getRepositoryToken(ScheduledReminder), useValue: reminderRepo },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
        { provide: getQueueToken('accountability'), useValue: queue },
        { provide: MessagingService, useValue: { send: jest.fn() } },
        { provide: OutboundRecorderService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get<ScheduleService>(ScheduleService);
  });

  it('supersedes an older pending one-shot at the same minute with the same intent', async () => {
    reminderRepo.find.mockResolvedValue([olderDup]);
    reminderRepo.findOne.mockResolvedValue(olderDup); // cancel() re-reads the row

    const result = await service.enqueue({
      userId: 'u-1',
      sessionId: 's-1',
      fireAt,
      message: 'tailor pickup time. go grab those clothes and send me proof when you got em.',
    });

    expect(result.ok).toBe(true);
    expect(reminderRepo.update).toHaveBeenCalledWith(
      'rem-old',
      expect.objectContaining({
        status: ScheduledReminderStatus.CANCELLED,
      }),
    );
    expect(reminderRepo.save).toHaveBeenCalled();
  });

  it('keeps two distinct-intent one-shots that happen to share the minute', async () => {
    const meds = { ...olderDup, message: 'evening meds. take them and confirm.' };
    reminderRepo.find.mockResolvedValue([meds]);
    reminderRepo.findOne.mockResolvedValue(meds);

    const result = await service.enqueue({
      userId: 'u-1',
      sessionId: 's-1',
      fireAt,
      message: 'call your mom about the dinner plans.',
    });

    expect(result.ok).toBe(true);
    expect(reminderRepo.update).not.toHaveBeenCalledWith(
      'rem-old',
      expect.objectContaining({
        status: ScheduledReminderStatus.CANCELLED,
      }),
    );
    expect(reminderRepo.save).toHaveBeenCalled();
  });
});
