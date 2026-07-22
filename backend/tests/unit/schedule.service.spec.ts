import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { ScheduleService, normalizeLocalTime } from '../../src/accountability/schedule.service';
import { ScheduledReminder, ScheduledReminderStatus, ReminderRecurrence } from '../../src/data/entities/scheduled-reminder.entity';
import { User } from '../../src/data/entities/user.entity';
import { MessagingService } from '../../src/messaging/messaging.service';
import { OutboundRecorderService } from '../../src/data/outbound-recorder.service';

describe('ScheduleService', () => {
  let service: ScheduleService;
  let reminderRepo: { save: jest.Mock; find: jest.Mock; findOne: jest.Mock; update: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let queue: { add: jest.Mock; getJob: jest.Mock };
  let messagingService: { send: jest.Mock };
  let recorder: { record: jest.Mock };

  beforeEach(async () => {
    recorder = { record: jest.fn().mockResolvedValue(undefined) };
    reminderRepo = {
      save: jest.fn().mockImplementation(async (row) => ({ id: 'rem-1', ...row })),
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    };
    userRepo = { findOne: jest.fn() };
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }), getJob: jest.fn() };
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

  describe('enqueue', () => {
    it('persists a reminder and adds a BullMQ delayed job', async () => {
      const fireAt = new Date(Date.now() + 10 * 60_000); // 10 min out

      const result = await service.enqueue({
        userId: 'u-1',
        sessionId: 's-1',
        createdByMessageId: 'm-1',
        fireAt,
        message: 'time to hit the workout',
      });

      expect(result.ok).toBe(true);
      expect(reminderRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        user_id: 'u-1',
        session_id: 's-1',
        created_by_message_id: 'm-1',
        fire_at: fireAt,
        message: 'time to hit the workout',
        status: ScheduledReminderStatus.PENDING,
      }));
      expect(queue.add).toHaveBeenCalledWith(
        'send-scheduled-reminder',
        { reminderId: 'rem-1' },
        expect.objectContaining({ delay: expect.any(Number) }),
      );
      expect(reminderRepo.update).toHaveBeenCalledWith('rem-1', { bull_job_id: 'job-1' });
    });

    it('rejects fire_at in the past', async () => {
      const result = await service.enqueue({
        userId: 'u-1',
        fireAt: new Date(Date.now() - 60_000),
        message: 'late',
      });

      expect(result.ok).toBe(false);
      // A past time is rejected by the same "minimum 2 minutes from now" guard.
      if (!result.ok) expect(result.reason).toMatch(/2 minutes|sooner|future|past/i);
      expect(queue.add).not.toHaveBeenCalled();
      expect(reminderRepo.save).not.toHaveBeenCalled();
    });

    it('rejects fire_at less than 30s out', async () => {
      const result = await service.enqueue({
        userId: 'u-1',
        fireAt: new Date(Date.now() + 5_000),
        message: 'too soon',
      });
      expect(result.ok).toBe(false);
    });

    it('rejects fire_at more than a year out', async () => {
      const result = await service.enqueue({
        userId: 'u-1',
        fireAt: new Date(Date.now() + 400 * 24 * 60 * 60 * 1000),
        message: 'too far',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/1 year/i);
    });

    it('rejects empty message', async () => {
      const result = await service.enqueue({
        userId: 'u-1',
        fireAt: new Date(Date.now() + 60 * 60_000),
        message: '   ',
      });
      expect(result.ok).toBe(false);
    });

    it('rejects NaN dates', async () => {
      const result = await service.enqueue({
        userId: 'u-1',
        fireAt: new Date('not a date'),
        message: 'hi',
      });
      expect(result.ok).toBe(false);
    });
  });

  // Karibi 2026-07-08 "dozens every morning": the coaching model spawned a
  // brand-new daily chain every time it set "remind me each morning", so
  // redundant reminders stacked and all fired in the same window. A daily
  // reminder is now idempotent per (user, local time).
  describe('enqueue — daily recurrence dedup', () => {
    const dailyRec = { rule: ReminderRecurrence.DAILY, localTime: '09:00', offsetMinutes: -300 };
    const fireAt = () => new Date(Date.now() + 60 * 60_000);

    it('collapses an IDENTICAL repeat daily reminder (same time AND message) into the existing chain', async () => {
      reminderRepo.findOne.mockResolvedValueOnce({
        id: 'rem-existing',
        fire_at: new Date(Date.now() + 3 * 60 * 60_000),
      });

      const result = await service.enqueue({
        userId: 'u-1',
        fireAt: fireAt(),
        message: 'weigh in',
        recurrence: { ...dailyRec },
      });

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.reminderId).toBe('rem-existing');
      // No duplicate row, no duplicate Bull job.
      expect(reminderRepo.save).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
      // The dedup key now includes the message, not just the time.
      expect(reminderRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ message: 'weigh in' }) }),
      );
      // Surviving chain keeps its message (it's part of the key); offset/tz refresh.
      expect(reminderRepo.update).toHaveBeenCalledWith(
        'rem-existing',
        expect.objectContaining({ recurrence_offset_minutes: -300 }),
      );
    });

    // The regression Karibi hit 2026-07-16: an "8pm log dinner" and an "8pm walk"
    // are DIFFERENT reminders at the same clock time. The old time-only dedup key
    // overwrote one with the other; keying on message too keeps both alive.
    it('does NOT collapse a different-message reminder at the same time (distinct purposes coexist)', async () => {
      reminderRepo.findOne.mockResolvedValueOnce(null); // no same-time+same-message match

      const result = await service.enqueue({
        userId: 'u-1',
        fireAt: fireAt(),
        message: '8pm walk',
        recurrence: { ...dailyRec, localTime: '20:00' },
      });

      expect(result.ok).toBe(true);
      expect(reminderRepo.save).toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalled();
      // Proves the dedup lookup discriminates on message, not just the slot.
      expect(reminderRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ message: '8pm walk', recurrence_local_time: '20:00' }),
        }),
      );
    });

    it('creates a fresh chain when no pending daily reminder exists at that time', async () => {
      reminderRepo.findOne.mockResolvedValueOnce(null);

      const result = await service.enqueue({
        userId: 'u-1',
        fireAt: fireAt(),
        message: 'morning weigh in',
        recurrence: { ...dailyRec },
      });

      expect(result.ok).toBe(true);
      expect(reminderRepo.save).toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalled();
    });

    it('normalizes the local time before dedup and save so "8:00" and "08:00" collapse', async () => {
      reminderRepo.findOne.mockResolvedValueOnce(null);

      await service.enqueue({
        userId: 'u-1',
        fireAt: fireAt(),
        message: 'weigh in',
        recurrence: { rule: ReminderRecurrence.DAILY, localTime: '8:00', offsetMinutes: -300 },
      });

      // Dedup lookup AND the stored row use the canonical "08:00", so a later
      // "08:00" request finds this chain instead of spawning a duplicate.
      expect(reminderRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ recurrence_local_time: '08:00' }) }),
      );
      expect(reminderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ recurrence_local_time: '08:00' }),
      );
    });

    it('rejects a daily reminder with an unparseable local time', async () => {
      const result = await service.enqueue({
        userId: 'u-1',
        fireAt: fireAt(),
        message: 'x',
        recurrence: { rule: ReminderRecurrence.DAILY, localTime: 'half eight', offsetMinutes: -300 },
      });

      expect(result.ok).toBe(false);
      expect(reminderRepo.save).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('recovers from a unique-violation race by returning the winning chain', async () => {
      // findOne #1 (dedup) misses, save races and hits the partial-unique index,
      // findOne #2 returns the concurrent winner.
      reminderRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'rem-winner', fire_at: new Date(Date.now() + 60 * 60_000) });
      reminderRepo.save.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));

      const result = await service.enqueue({
        userId: 'u-1',
        fireAt: fireAt(),
        message: 'weigh in',
        recurrence: { ...dailyRec },
      });

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.reminderId).toBe('rem-winner');
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('does not dedup a parented occurrence (recurrence re-enqueue keeps the chain alive)', async () => {
      // A pending sibling is present, but a parented occurrence must still be
      // created — otherwise the daily chain would stop after its first fire.
      reminderRepo.findOne.mockResolvedValue({ id: 'rem-existing', fire_at: new Date() });

      const result = await service.enqueue({
        userId: 'u-1',
        fireAt: fireAt(),
        message: 'next day',
        recurrence: { ...dailyRec, parentId: 'parent-1' },
      });

      expect(result.ok).toBe(true);
      expect(reminderRepo.save).toHaveBeenCalled();
    });
  });

  describe('fire', () => {
    it('sends the message and marks fired when reminder is pending', async () => {
      reminderRepo.findOne.mockResolvedValue({
        id: 'rem-1',
        user_id: 'u-1',
        status: ScheduledReminderStatus.PENDING,
        message: 'go time',
      });
      userRepo.findOne.mockResolvedValue({ id: 'u-1', phone_number: '+15551234567', crisis_hold: false });

      await service.fire('rem-1');

      expect(messagingService.send).toHaveBeenCalledWith('+15551234567', 'go time');
      expect(reminderRepo.update).toHaveBeenCalledWith('rem-1', expect.objectContaining({
        status: ScheduledReminderStatus.FIRED,
        fired_at: expect.any(Date),
      }));
    });

    it('records the fired reminder as a Message row (kind=reminder)', async () => {
      reminderRepo.findOne.mockResolvedValue({
        id: 'rem-1',
        user_id: 'u-1',
        status: ScheduledReminderStatus.PENDING,
        message: 'go time',
      });
      userRepo.findOne.mockResolvedValue({ id: 'u-1', phone_number: '+15551234567', crisis_hold: false });

      await service.fire('rem-1');

      expect(recorder.record).toHaveBeenCalledWith('u-1', 'go time', 'reminder');
    });

    it('does NOT record a Message row when the send fails', async () => {
      reminderRepo.findOne.mockResolvedValue({
        id: 'rem-1',
        user_id: 'u-1',
        status: ScheduledReminderStatus.PENDING,
        message: 'go time',
      });
      userRepo.findOne.mockResolvedValue({ id: 'u-1', phone_number: '+15551234567', crisis_hold: false });
      messagingService.send.mockRejectedValueOnce(new Error('twilio down'));

      await expect(service.fire('rem-1')).rejects.toThrow();

      expect(recorder.record).not.toHaveBeenCalled();
    });

    it('skips silently when reminder already fired (idempotent re-delivery)', async () => {
      reminderRepo.findOne.mockResolvedValue({ id: 'rem-1', status: ScheduledReminderStatus.FIRED });

      await service.fire('rem-1');

      expect(messagingService.send).not.toHaveBeenCalled();
      expect(reminderRepo.update).not.toHaveBeenCalled();
    });

    it('skips silently when reminder is cancelled', async () => {
      reminderRepo.findOne.mockResolvedValue({ id: 'rem-1', status: ScheduledReminderStatus.CANCELLED });
      await service.fire('rem-1');
      expect(messagingService.send).not.toHaveBeenCalled();
    });

    it('does not send when user is in crisis hold; marks cancelled', async () => {
      reminderRepo.findOne.mockResolvedValue({
        id: 'rem-1', user_id: 'u-1', status: ScheduledReminderStatus.PENDING, message: 'hey',
      });
      userRepo.findOne.mockResolvedValue({ id: 'u-1', phone_number: '+15551234567', crisis_hold: true });

      await service.fire('rem-1');

      expect(messagingService.send).not.toHaveBeenCalled();
      expect(reminderRepo.update).toHaveBeenCalledWith('rem-1', expect.objectContaining({
        status: ScheduledReminderStatus.CANCELLED,
        failure_reason: 'user in crisis hold',
      }));
    });

    it('marks failed when messaging throws and re-throws for BullMQ retry', async () => {
      reminderRepo.findOne.mockResolvedValue({
        id: 'rem-1', user_id: 'u-1', status: ScheduledReminderStatus.PENDING, message: 'x',
      });
      userRepo.findOne.mockResolvedValue({ id: 'u-1', phone_number: '+1', crisis_hold: false });
      messagingService.send.mockRejectedValueOnce(new Error('twilio down'));

      await expect(service.fire('rem-1')).rejects.toThrow('twilio down');

      expect(reminderRepo.update).toHaveBeenCalledWith('rem-1', expect.objectContaining({
        status: ScheduledReminderStatus.FAILED,
        failure_reason: expect.stringContaining('twilio down'),
      }));
    });

    // A transient send failure must NOT kill a recurring chain (Karibi 2026-07-16:
    // reminders "stopped" after a hiccup). The next daily occurrence is re-armed
    // even though this send threw — the row is FAILED but tomorrow is enqueued.
    it('re-arms the next daily occurrence even when the send fails', async () => {
      reminderRepo.findOne.mockResolvedValue({
        id: 'rem-1', user_id: 'u-1', status: ScheduledReminderStatus.PENDING, message: 'log dinner',
        session_id: null, created_by_message_id: null,
        recurrence_rule: ReminderRecurrence.DAILY,
        recurrence_local_time: '20:00',
        recurrence_offset_minutes: -300,
        recurrence_iana_timezone: null,
        recurrence_parent_id: 'rem-1',
      });
      userRepo.findOne.mockResolvedValue({ id: 'u-1', phone_number: '+15551234567', crisis_hold: false });
      messagingService.send.mockRejectedValueOnce(new Error('sendblue 500'));
      const enqueueSpy = jest.spyOn(service, 'enqueue').mockResolvedValue({ ok: true, reminderId: 'rem-2', fireAtIso: '' } as any);

      await expect(service.fire('rem-1')).rejects.toThrow('sendblue 500');

      // FAILED for this occurrence, but the chain lives on: tomorrow was enqueued.
      expect(reminderRepo.update).toHaveBeenCalledWith('rem-1', expect.objectContaining({
        status: ScheduledReminderStatus.FAILED,
      }));
      expect(enqueueSpy).toHaveBeenCalledWith(expect.objectContaining({
        message: 'log dinner',
        recurrence: expect.objectContaining({ rule: ReminderRecurrence.DAILY, localTime: '20:00' }),
      }));
    });
  });

  describe('cancel', () => {
    it('removes the BullMQ job and marks cancelled when pending', async () => {
      reminderRepo.findOne
        .mockResolvedValueOnce({ id: 'rem-1', status: ScheduledReminderStatus.PENDING, bull_job_id: 'job-1' })
        .mockResolvedValueOnce({ id: 'rem-1', status: ScheduledReminderStatus.CANCELLED });
      const removeMock = jest.fn().mockResolvedValue(undefined);
      queue.getJob.mockResolvedValue({ remove: removeMock });

      const result = await service.cancel('rem-1');

      expect(queue.getJob).toHaveBeenCalledWith('job-1');
      expect(removeMock).toHaveBeenCalled();
      expect(reminderRepo.update).toHaveBeenCalledWith('rem-1', { status: ScheduledReminderStatus.CANCELLED });
      expect(result?.status).toBe(ScheduledReminderStatus.CANCELLED);
    });

    it('no-ops when reminder is already fired', async () => {
      const fired = { id: 'rem-1', status: ScheduledReminderStatus.FIRED, bull_job_id: 'job-1' };
      reminderRepo.findOne.mockResolvedValue(fired);

      const result = await service.cancel('rem-1');

      expect(queue.getJob).not.toHaveBeenCalled();
      expect(reminderRepo.update).not.toHaveBeenCalled();
      expect(result).toBe(fired);
    });

    it('returns null when reminder does not exist', async () => {
      reminderRepo.findOne.mockResolvedValue(null);
      expect(await service.cancel('nope')).toBeNull();
    });
  });
});

describe('normalizeLocalTime', () => {
  it('zero-pads a single-digit hour', () => {
    expect(normalizeLocalTime('8:00')).toBe('08:00');
    expect(normalizeLocalTime('9:30')).toBe('09:30');
  });

  it('passes a valid padded time through unchanged', () => {
    expect(normalizeLocalTime('08:00')).toBe('08:00');
    expect(normalizeLocalTime('23:59')).toBe('23:59');
    expect(normalizeLocalTime('0:00')).toBe('00:00');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeLocalTime('  8:00 ')).toBe('08:00');
  });

  it('rejects out-of-range and malformed values', () => {
    for (const bad of ['24:00', '12:60', '8:5', '800', '8', 'abc', '', ' ', ':', '8:', null, undefined]) {
      expect(normalizeLocalTime(bad as string)).toBeNull();
    }
  });
});
