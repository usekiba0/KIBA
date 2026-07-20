import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { DataRightsService } from '../../src/data/data-rights.service';
import { User } from '../../src/data/entities/user.entity';
import { Subscription } from '../../src/data/entities/subscription.entity';
import { Message } from '../../src/data/entities/message.entity';
import { NutritionalAnalysis } from '../../src/data/entities/nutritional-analysis.entity';
import { SessionSummary } from '../../src/data/entities/session-summary.entity';
import { CrisisAlert } from '../../src/data/entities/crisis-alert.entity';
import { ConversationSession } from '../../src/data/entities/conversation-session.entity';
import { StripeService } from '../../src/onboarding/stripe.service';

describe('DataRightsService — deleteUserData (cascading wipe)', () => {
  let service: DataRightsService;
  let subFindOne: jest.Mock;
  let managerQuery: jest.Mock;
  let dsQuery: jest.Mock;
  let cancelSubscription: jest.Mock;
  let getJob: jest.Mock;
  let getJobs: jest.Mock;
  let mockDataSource: any;

  // Stand-in entity metadata: two user-scoped tables, one global table that
  // must NOT be touched, plus the users table itself.
  const entityMetadatas = [
    { tableName: 'users', columns: [{ databaseName: 'id' }] },
    { tableName: 'messages', columns: [{ databaseName: 'id' }, { databaseName: 'user_id' }] },
    { tableName: 'goals', columns: [{ databaseName: 'user_id' }] },
    { tableName: 'coaching_knowledge', columns: [{ databaseName: 'id' }] },
  ];

  beforeEach(async () => {
    subFindOne = jest.fn().mockResolvedValue({ stripe_subscription_id: 'sub_123' });
    managerQuery = jest.fn().mockResolvedValue(undefined);
    // Top-level dataSource.query — used to read the user's reminder job ids
    // BEFORE the rows are wiped. Defaults to "no reminder jobs".
    dsQuery = jest.fn().mockResolvedValue([]);
    cancelSubscription = jest.fn().mockResolvedValue(undefined);
    getJob = jest.fn().mockResolvedValue(null);
    getJobs = jest.fn().mockResolvedValue([]);

    mockDataSource = {
      entityMetadatas,
      query: dsQuery,
      transaction: jest.fn(async (cb: any) => cb({ query: managerQuery })),
    };

    const repo = () => ({ findOne: jest.fn(), find: jest.fn() });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataRightsService,
        { provide: getRepositoryToken(User), useValue: repo() },
        { provide: getRepositoryToken(Subscription), useValue: { findOne: subFindOne } },
        { provide: getRepositoryToken(Message), useValue: repo() },
        { provide: getRepositoryToken(NutritionalAnalysis), useValue: repo() },
        { provide: getRepositoryToken(SessionSummary), useValue: repo() },
        { provide: getRepositoryToken(CrisisAlert), useValue: repo() },
        { provide: getRepositoryToken(ConversationSession), useValue: repo() },
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: getQueueToken('accountability'), useValue: { getJob, getJobs } },
        { provide: StripeService, useValue: { cancelSubscription } },
      ],
    }).compile();

    service = module.get<DataRightsService>(DataRightsService);
  });

  it('deletes from every user-scoped table inside a transaction', async () => {
    await service.deleteUserData('user-1');

    const deleted = managerQuery.mock.calls.map((c) => c[0] as string);
    expect(deleted).toContain('DELETE FROM "messages" WHERE user_id = $1');
    expect(deleted).toContain('DELETE FROM "goals" WHERE user_id = $1');
    // Every child delete is parameterised by the user id.
    expect(managerQuery).toHaveBeenCalledWith('DELETE FROM "messages" WHERE user_id = $1', ['user-1']);
  });

  it('never deletes from tables without a user_id column', async () => {
    await service.deleteUserData('user-1');
    const deleted = managerQuery.mock.calls.map((c) => c[0] as string);
    expect(deleted.some((q) => q.includes('coaching_knowledge'))).toBe(false);
  });

  it('deletes the user row itself, last', async () => {
    await service.deleteUserData('user-1');
    const deleted = managerQuery.mock.calls.map((c) => c[0] as string);
    expect(deleted[deleted.length - 1]).toBe('DELETE FROM "users" WHERE id = $1');
  });

  it('cancels the Stripe subscription before deleting', async () => {
    await service.deleteUserData('user-1');
    expect(cancelSubscription).toHaveBeenCalledWith('sub_123');
  });

  it('still wipes data if Stripe cancellation throws', async () => {
    cancelSubscription.mockRejectedValueOnce(new Error('stripe down'));
    await expect(service.deleteUserData('user-1')).resolves.toBeUndefined();
    expect(managerQuery).toHaveBeenCalledWith('DELETE FROM "users" WHERE id = $1', ['user-1']);
  });

  // Karibi 2026-07-08: deleted test accounts left send-checkin / reminder /
  // recap / surprise / weekly-review jobs orphaned in Bull, firing (or no-oping)
  // every morning. The row wipe never touched Redis. Now the delete drains them.
  describe('queue drain', () => {
    it("removes the user's queued reminder jobs from Bull (keyed by reminderId)", async () => {
      dsQuery.mockResolvedValueOnce([{ bull_job_id: 'job-r1' }, { bull_job_id: 'job-r2' }]);
      const remove = jest.fn().mockResolvedValue(undefined);
      getJob.mockResolvedValue({ remove });

      await service.deleteUserData('user-1');

      expect(getJob).toHaveBeenCalledWith('job-r1');
      expect(getJob).toHaveBeenCalledWith('job-r2');
      expect(remove).toHaveBeenCalledTimes(2);
    });

    it('removes userId-keyed jobs (checkin/recap/surprise) and leaves other users alone', async () => {
      const rmMine = jest.fn().mockResolvedValue(undefined);
      const rmOther = jest.fn().mockResolvedValue(undefined);
      getJobs.mockResolvedValue([
        { data: { userId: 'user-1' }, remove: rmMine },
        { data: { userId: 'someone-else' }, remove: rmOther },
        { data: {}, remove: jest.fn().mockResolvedValue(undefined) },
      ]);

      await service.deleteUserData('user-1');

      expect(rmMine).toHaveBeenCalled();
      expect(rmOther).not.toHaveBeenCalled();
    });

    it('reads reminder job ids BEFORE the rows are wiped', async () => {
      const order: string[] = [];
      dsQuery.mockImplementation(async () => {
        order.push('read-jobs');
        return [];
      });
      mockDataSource.transaction.mockImplementation(async (cb: any) => {
        order.push('delete');
        return cb({ query: managerQuery });
      });

      await service.deleteUserData('user-1');

      expect(order).toEqual(['read-jobs', 'delete']);
    });

    it('still completes the DB delete when queue draining throws', async () => {
      getJobs.mockRejectedValueOnce(new Error('redis down'));
      await expect(service.deleteUserData('user-1')).resolves.toBeUndefined();
      expect(managerQuery).toHaveBeenCalledWith('DELETE FROM "users" WHERE id = $1', ['user-1']);
    });
  });
});
