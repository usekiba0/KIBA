import { Test, TestingModule } from '@nestjs/testing';
import { MessageRoute, MessageRouterService } from '../../src/accountability/message-router.service';
import { AntiGhostService } from '../../src/accountability/anti-ghost.service';
import { GhostState } from '../../src/data/entities/anti-ghost-state.entity';

describe('MessageRouterService', () => {
  let service: MessageRouterService;
  let mockAntiGhostService: any;

  beforeEach(async () => {
    mockAntiGhostService = {
      getState: jest.fn().mockResolvedValue(GhostState.ACTIVE),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageRouterService,
        { provide: AntiGhostService, useValue: mockAntiGhostService },
      ],
    }).compile();

    service = module.get<MessageRouterService>(MessageRouterService);
  });

  describe('route', () => {
    it('routes a media message as PROOF regardless of ghost state', async () => {
      mockAntiGhostService.getState.mockResolvedValue(GhostState.ACTIVE);
      const route = await service.route({ userId: 'u1', hasMedia: true, body: '' });
      expect(route).toBe(MessageRoute.PROOF);
    });

    it('routes a media message as PROOF even when user is in ghost_1 state', async () => {
      mockAntiGhostService.getState.mockResolvedValue(GhostState.GHOST_1);
      const route = await service.route({ userId: 'u1', hasMedia: true, body: '' });
      expect(route).toBe(MessageRoute.PROOF);
    });

    it('routes a text message as CHECKIN_RESPONSE when user is in ghost_1 state', async () => {
      mockAntiGhostService.getState.mockResolvedValue(GhostState.GHOST_1);
      const route = await service.route({ userId: 'u1', hasMedia: false, body: 'done' });
      expect(route).toBe(MessageRoute.CHECKIN_RESPONSE);
    });

    it('routes a text message as CHECKIN_RESPONSE when user is in ghost_2 state', async () => {
      mockAntiGhostService.getState.mockResolvedValue(GhostState.GHOST_2);
      const route = await service.route({ userId: 'u1', hasMedia: false, body: 'I did it' });
      expect(route).toBe(MessageRoute.CHECKIN_RESPONSE);
    });

    it('routes a text message as CHECKIN_RESPONSE when user is in ghost_3 state', async () => {
      mockAntiGhostService.getState.mockResolvedValue(GhostState.GHOST_3);
      const route = await service.route({ userId: 'u1', hasMedia: false, body: 'sorry' });
      expect(route).toBe(MessageRoute.CHECKIN_RESPONSE);
    });

    it('routes a text message as COACHING when user is active with no ghost state', async () => {
      mockAntiGhostService.getState.mockResolvedValue(GhostState.ACTIVE);
      const route = await service.route({ userId: 'u1', hasMedia: false, body: 'how am I doing?' });
      expect(route).toBe(MessageRoute.COACHING);
    });

    it('looks up ghost state by userId', async () => {
      await service.route({ userId: 'user-abc', hasMedia: false, body: 'test' });
      expect(mockAntiGhostService.getState).toHaveBeenCalledWith('user-abc');
    });
  });
});
