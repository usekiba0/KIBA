import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { CheckinService } from '../../src/accountability/checkin.service';
import { User, UserStatus } from '../../src/data/entities/user.entity';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    phone_number: '+15551234567',
    name: 'Alex',
    coaching_focus: null as any,
    goals: null as any,
    checkin_time: '09:00',
    height_cm: null,
    weight_kg: null,
    age: null,
    health_conditions: [],
    dietary_restrictions: [],
    injuries: null,
    status: UserStatus.ACTIVE,
    crisis_hold: false,
    registered_at: new Date(),
    last_active_at: null,
    ...overrides,
  };
}

describe('CheckinService', () => {
  let service: CheckinService;
  let mockUserRepo: any;
  let mockQueue: any;

  beforeEach(async () => {
    mockUserRepo = {
      find: jest.fn().mockResolvedValue([makeUser()]),
    };
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-checkin-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckinService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getQueueToken('accountability'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<CheckinService>(CheckinService);
  });

  describe('scheduleCheckin', () => {
    it('adds a send-checkin job to the accountability queue', async () => {
      const user = makeUser({ checkin_time: '09:00' });
      await service.scheduleCheckin(user);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-checkin',
        expect.objectContaining({ userId: user.id }),
        expect.objectContaining({ delay: expect.any(Number) }),
      );
    });

    it('does not schedule a checkin for a user with no checkin_time', async () => {
      const user = makeUser({ checkin_time: null as any });
      await service.scheduleCheckin(user);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('stores the job id on the returned job object', async () => {
      const user = makeUser({ checkin_time: '08:00' });
      const job = await service.scheduleCheckin(user);
      expect(job).toBeDefined();
    });
  });

  describe('computeDelayMs', () => {
    beforeEach(() => {
      // Pin clock to 2026-01-01 12:00:00 local time
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-01-01T12:00:00'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns a positive delay in milliseconds', () => {
      const delay = service.computeDelayMs('14:00');
      expect(delay).toBeGreaterThan(0);
    });

    it('schedules for tomorrow when the time has already passed today', () => {
      // Clock is at 12:00 — 10:00 has already passed
      const delay = service.computeDelayMs('10:00');
      // Next 10:00 is 22h away
      const twentyTwoHoursMs = 22 * 60 * 60 * 1000;
      expect(delay).toBeGreaterThanOrEqual(twentyTwoHoursMs);
    });

    it('schedules for today when the time is still in the future', () => {
      // Clock is at 12:00 — 14:00 is 2h ahead today
      const delay = service.computeDelayMs('14:00');
      const twoHoursMs = 2 * 60 * 60 * 1000;
      const threeHoursMs = 3 * 60 * 60 * 1000;
      expect(delay).toBeGreaterThanOrEqual(twoHoursMs);
      expect(delay).toBeLessThan(threeHoursMs);
    });
  });

  describe('scheduleAllCheckins', () => {
    it('queries all trial and active users', async () => {
      await service.scheduleAllCheckins();
      expect(mockUserRepo.find).toHaveBeenCalledWith({
        where: expect.arrayContaining([
          expect.objectContaining({ status: UserStatus.ACTIVE }),
          expect.objectContaining({ status: UserStatus.TRIAL }),
        ]),
      });
    });

    it('schedules a checkin job for each user returned', async () => {
      mockUserRepo.find.mockResolvedValue([
        makeUser({ id: 'user-1', checkin_time: '09:00' }),
        makeUser({ id: 'user-2', checkin_time: '18:00' }),
      ]);
      await service.scheduleAllCheckins();
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
    });

    it('skips users that have no checkin_time configured', async () => {
      mockUserRepo.find.mockResolvedValue([
        makeUser({ id: 'user-1', checkin_time: '09:00' }),
        makeUser({ id: 'user-2', checkin_time: null as any }),
      ]);
      await service.scheduleAllCheckins();
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
    });

    it('does not throw when no users are found', async () => {
      mockUserRepo.find.mockResolvedValue([]);
      await expect(service.scheduleAllCheckins()).resolves.toBeUndefined();
    });
  });
});
