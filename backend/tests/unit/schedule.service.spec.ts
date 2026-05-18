import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { ScheduleService } from '../../src/accountability/schedule.service';
import { ScheduledReminder, ScheduledReminderStatus } from '../../src/data/entities/scheduled-reminder.entity';
import { User } from '../../src/data/entities/user.entity';
import { MessagingService } from '../../src/messaging/messaging.service';

describe('ScheduleService', () => {
  let service: ScheduleService;
  let reminderRepo: { save: jest.Mock; find: jest.Mock; findOne: jest.Mock; update: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let queue: { add: jest.Mock; getJob: jest.Mock };
  let messagingService: { send: jest.Mock };

  beforeEach(async () => {
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
      if (!result.ok) expect(result.reason).toMatch(/future/i);
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
