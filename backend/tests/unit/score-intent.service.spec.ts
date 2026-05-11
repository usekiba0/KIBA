import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ScoreIntentService } from '../../src/accountability/score-intent.service';
import { ExecutionScore } from '../../src/data/entities/execution-score.entity';

function makeScore(score: number): ExecutionScore {
  return {
    id: 'score-1', user_id: 'user-1',
    current_score: score,
    completion_rate: 0.7, proof_rate: 0.6,
    response_time_score: 0.8, streak_bonus: 0.3,
    snapshot_date: new Date(), created_at: new Date(),
  };
}

describe('ScoreIntentService', () => {
  let service: ScoreIntentService;
  let mockScoreRepo: any;

  beforeEach(async () => {
    mockScoreRepo = {
      findOne: jest.fn().mockResolvedValue(makeScore(72)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoreIntentService,
        { provide: getRepositoryToken(ExecutionScore), useValue: mockScoreRepo },
      ],
    }).compile();

    service = module.get<ScoreIntentService>(ScoreIntentService);
  });

  describe('isScoreIntent', () => {
    it('detects "what is my score"', () => {
      expect(service.isScoreIntent('what is my score')).toBe(true);
    });

    it('detects "whats my score"', () => {
      expect(service.isScoreIntent("whats my score")).toBe(true);
    });

    it('detects "my score" anywhere in the message', () => {
      expect(service.isScoreIntent('can you tell me my score?')).toBe(true);
    });

    it('detects "how am i doing"', () => {
      expect(service.isScoreIntent('how am i doing')).toBe(true);
    });

    it('detects "execution score" phrasing', () => {
      expect(service.isScoreIntent('show me my execution score')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(service.isScoreIntent('WHAT IS MY SCORE')).toBe(true);
    });

    it('returns false for unrelated messages', () => {
      expect(service.isScoreIntent('I just finished my workout')).toBe(false);
      expect(service.isScoreIntent('reset my coaching')).toBe(false);
    });
  });

  describe('buildScoreReply', () => {
    it('includes the numeric score', async () => {
      const reply = await service.buildScoreReply('user-1');
      expect(reply).toContain('72');
    });

    it('includes context about what the score means', async () => {
      const reply = await service.buildScoreReply('user-1');
      expect(reply.length).toBeGreaterThan(20);
    });

    it('returns a fallback message when no score exists', async () => {
      mockScoreRepo.findOne.mockResolvedValue(null);
      const reply = await service.buildScoreReply('user-1');
      expect(reply).toBeTruthy();
      expect(reply.length).toBeGreaterThan(5);
    });

    it('fetches the latest score ordered by snapshot_date DESC', async () => {
      await service.buildScoreReply('user-1');
      expect(mockScoreRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 'user-1' },
          order: expect.objectContaining({ snapshot_date: 'DESC' }),
        }),
      );
    });
  });
});
