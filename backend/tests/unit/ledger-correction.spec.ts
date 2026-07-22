import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LedgerCorrectionService } from '../../src/accountability/ledger-correction.service';
import { DailyTask, TaskStatus } from '../../src/data/entities/daily-task.entity';
import { Strike } from '../../src/data/entities/strike.entity';
import { User } from '../../src/data/entities/user.entity';
import { ScoreService } from '../../src/accountability/score.service';

const userId = 'user-1';

function startOfDay(daysAgo = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d;
}

describe('LedgerCorrectionService', () => {
  let service: LedgerCorrectionService;
  let taskRepo: any;
  let strikeRepo: any;
  let userRepo: any;
  let scoreService: any;

  const missedTask = (daysAgo = 0) => ({
    id: 'task-1',
    user_id: userId,
    task_description: 'write down why you skip legs',
    scheduled_date: startOfDay(daysAgo),
    status: TaskStatus.MISSED,
    completion_timestamp: null,
  });

  beforeEach(async () => {
    taskRepo = {
      find: jest.fn().mockResolvedValue([missedTask()]),
      save: jest.fn(async (t: any) => t),
    };
    strikeRepo = { delete: jest.fn().mockResolvedValue({ affected: 1 }) };
    userRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: userId,
        utc_offset_minutes: 0,
        miss_counts_by_dow: [0, 1, 0, 0, 2, 0, 0],
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    scoreService = { updateScore: jest.fn().mockResolvedValue({ current_score: 71 }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LedgerCorrectionService,
        { provide: getRepositoryToken(DailyTask), useValue: taskRepo },
        { provide: getRepositoryToken(Strike), useValue: strikeRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: ScoreService, useValue: scoreService },
      ],
    }).compile();

    service = module.get(LedgerCorrectionService);
  });

  it('marks the wrongly-missed task completed and deletes its strikes', async () => {
    const result = await service.correctMiss(userId, 'today');

    expect(result.ok).toBe(true);
    expect(taskRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'task-1',
        status: TaskStatus.COMPLETED,
        completion_timestamp: expect.any(Date),
      }),
    );
    expect(strikeRepo.delete).toHaveBeenCalledWith({ daily_task_id: 'task-1' });
  });

  it('recomputes the score and reports what changed', async () => {
    const result = await service.correctMiss(userId, 'today');

    expect(scoreService.updateScore).toHaveBeenCalledWith(userId);
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        corrected: 1,
        tasks: ['write down why you skip legs'],
        new_score: 71,
      }),
    );
  });

  it('decrements the day-of-week miss counter without going below zero', async () => {
    // Task scheduled today; with offset 0 the dow is today's UTC day.
    const dow = new Date(startOfDay().getTime()).getUTCDay();
    const counts = [0, 0, 0, 0, 0, 0, 0];
    counts[dow] = 1;
    userRepo.findOne.mockResolvedValue({
      id: userId, utc_offset_minutes: 0, miss_counts_by_dow: counts,
    });

    await service.correctMiss(userId, 'today');

    const expected = [0, 0, 0, 0, 0, 0, 0];
    expect(userRepo.update).toHaveBeenCalledWith(userId, { miss_counts_by_dow: expected });

    // Second correction on an already-zero counter must clamp at 0.
    userRepo.findOne.mockResolvedValue({
      id: userId, utc_offset_minutes: 0, miss_counts_by_dow: expected,
    });
    await service.correctMiss(userId, 'today');
    expect(userRepo.update).toHaveBeenLastCalledWith(userId, { miss_counts_by_dow: expected });
  });

  it('targets yesterday when asked', async () => {
    await service.correctMiss(userId, 'yesterday');

    expect(taskRepo.find).toHaveBeenCalledWith({
      where: expect.objectContaining({
        user_id: userId,
        status: TaskStatus.MISSED,
        scheduled_date: startOfDay(1),
      }),
    });
  });

  it('returns ok:false when there is no missed task on record for that day', async () => {
    taskRepo.find.mockResolvedValue([]);

    const result = await service.correctMiss(userId, 'today');

    expect(result).toEqual({ ok: false, error: expect.stringContaining('no missed task') });
    expect(strikeRepo.delete).not.toHaveBeenCalled();
    expect(scoreService.updateScore).not.toHaveBeenCalled();
  });

  it('still succeeds when the score recompute fails (correction is the point)', async () => {
    scoreService.updateScore.mockRejectedValue(new Error('score db down'));

    const result = await service.correctMiss(userId, 'today');

    expect(result).toEqual(expect.objectContaining({ ok: true, corrected: 1, new_score: null }));
  });
});
