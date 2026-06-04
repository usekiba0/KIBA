import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
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
  let cancelSubscription: jest.Mock;

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
    cancelSubscription = jest.fn().mockResolvedValue(undefined);

    const mockDataSource = {
      entityMetadatas,
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
});
