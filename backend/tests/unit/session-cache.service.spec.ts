import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getRedisConnectionToken } from '@nestjs-modules/ioredis';
import { ConfigService } from '@nestjs/config';
import { SessionCacheService } from '../../src/data/session-cache.service';
import { Message, MessageRole } from '../../src/data/entities/message.entity';

describe('SessionCacheService Unit Tests', () => {
  let service: SessionCacheService;
  let mockRedis: { get: jest.Mock; setex: jest.Mock; del: jest.Mock };
  let mockMessageRepo: { find: jest.Mock };

  const mockConfig = {
    get: jest.fn((key: string, def?: unknown) => {
      if (key === 'SESSION_TIMEOUT_HOURS') return 4;
      return def;
    }),
  };

  beforeEach(async () => {
    mockRedis = { get: jest.fn(), setex: jest.fn(), del: jest.fn() };
    mockMessageRepo = { find: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        SessionCacheService,
        { provide: getRedisConnectionToken(), useValue: mockRedis },
        { provide: getRepositoryToken(Message), useValue: mockMessageRepo },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get(SessionCacheService);
  });

  describe('getSessionWindow', () => {
    it('should return cached messages from Redis without hitting Postgres', async () => {
      const cached = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
      ];
      mockRedis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getSessionWindow('user-1');

      expect(result.source).toBe('redis');
      expect(result.messages).toEqual(cached);
      expect(mockMessageRepo.find).not.toHaveBeenCalled();
    });

    it('should load from Postgres on cache miss and write back to Redis', async () => {
      mockRedis.get.mockResolvedValue(null);
      const dbMessages = [
        { role: MessageRole.USER, content: 'Hello from DB', created_at: new Date() } as Message,
      ];
      mockMessageRepo.find.mockResolvedValue(dbMessages);

      const result = await service.getSessionWindow('user-1');

      expect(result.source).toBe('postgres');
      expect(result.messages[0].role).toBe('user');
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'session:user-1',
        14400,
        expect.stringContaining('"role":"user"'),
      );
    });

    it('should return empty array and not write to Redis when Postgres has no messages', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockMessageRepo.find.mockResolvedValue([]);

      const result = await service.getSessionWindow('user-1');

      expect(result.messages).toEqual([]);
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });
  });

  describe('addMessage', () => {
    it('should append to existing Redis window', async () => {
      const existing = [{ role: 'user', content: 'Hello' }];
      mockRedis.get.mockResolvedValue(JSON.stringify(existing));

      await service.addMessage('user-1', 'assistant', 'Hi there!');

      const setexCall = mockRedis.setex.mock.calls[0];
      const written = JSON.parse(setexCall[2]);
      expect(written).toHaveLength(2);
      expect(written[1]).toEqual({ role: 'assistant', content: 'Hi there!' });
    });

    it('should create new window when Redis key is missing (upsert behaviour)', async () => {
      mockRedis.get.mockResolvedValue(null);

      await service.addMessage('user-1', 'user', 'First message');

      const setexCall = mockRedis.setex.mock.calls[0];
      const written = JSON.parse(setexCall[2]);
      expect(written).toHaveLength(1);
      expect(written[0]).toEqual({ role: 'user', content: 'First message' });
    });

    it('should trim window to 20 messages', async () => {
      const existing = Array.from({ length: 20 }, (_, i) => ({ role: 'user', content: `msg${i}` }));
      mockRedis.get.mockResolvedValue(JSON.stringify(existing));

      await service.addMessage('user-1', 'assistant', 'Message 21');

      const written = JSON.parse(mockRedis.setex.mock.calls[0][2]);
      expect(written).toHaveLength(20);
      expect(written[0].content).toBe('msg1'); // oldest dropped
      expect(written[19].content).toBe('Message 21');
    });
  });

  describe('invalidateSession', () => {
    it('should delete the Redis key', async () => {
      await service.invalidateSession('user-1');
      expect(mockRedis.del).toHaveBeenCalledWith('session:user-1');
    });
  });
});
