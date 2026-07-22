import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  OutboundRecorderService,
} from '../../src/data/outbound-recorder.service';
import { Message, MessageRole } from '../../src/data/entities/message.entity';
import { SessionBoundaryService } from '../../src/data/session-boundary.service';

const userId = 'user-1';
const sessionId = 'session-9';

describe('OutboundRecorderService', () => {
  let service: OutboundRecorderService;
  let mockMessageRepo: any;
  let mockSessionBoundary: any;

  beforeEach(async () => {
    mockMessageRepo = { save: jest.fn(async (m: any) => m) };
    mockSessionBoundary = {
      checkAndHandle: jest.fn().mockResolvedValue({ sessionId }),
      recordMessage: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboundRecorderService,
        { provide: getRepositoryToken(Message), useValue: mockMessageRepo },
        { provide: SessionBoundaryService, useValue: mockSessionBoundary },
      ],
    }).compile();

    service = module.get(OutboundRecorderService);
  });

  it('persists a scheduled outbound as an AI Message row with its kind', async () => {
    await service.record(userId, 'yo. 30 min till push.', 'reminder');

    expect(mockSessionBoundary.checkAndHandle).toHaveBeenCalledWith(userId);
    expect(mockMessageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: userId,
        session_id: sessionId,
        role: MessageRole.AI,
        content: 'yo. 30 min till push.',
        scheduled_kind: 'reminder',
      }),
    );
    expect(mockSessionBoundary.recordMessage).toHaveBeenCalledWith(sessionId);
  });

  it('never throws when the session boundary fails (visibility is best-effort)', async () => {
    mockSessionBoundary.checkAndHandle.mockRejectedValue(new Error('db down'));

    await expect(
      service.record(userId, 'ghost msg', 'ghost'),
    ).resolves.toBeUndefined();
    expect(mockMessageRepo.save).not.toHaveBeenCalled();
  });

  it('never throws when the Message save fails', async () => {
    mockMessageRepo.save.mockRejectedValue(new Error('insert failed'));

    await expect(
      service.record(userId, 'surprise msg', 'surprise'),
    ).resolves.toBeUndefined();
  });

  it('skips empty content instead of writing a blank row', async () => {
    await service.record(userId, '   ', 'dunning');

    expect(mockSessionBoundary.checkAndHandle).not.toHaveBeenCalled();
    expect(mockMessageRepo.save).not.toHaveBeenCalled();
  });
});
