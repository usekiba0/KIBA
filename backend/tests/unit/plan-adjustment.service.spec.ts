import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PlanAdjustmentService } from '../../src/accountability/plan-adjustment.service';
import { ExecutionScore } from '../../src/data/entities/execution-score.entity';
import { Goal, GoalType } from '../../src/data/entities/goal.entity';

function makeScore(score: number, daysAgo: number): ExecutionScore {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return {
    id: `score-${daysAgo}`,
    user_id: 'user-1',
    current_score: score,
    completion_rate: 0.5,
    proof_rate: 0.5,
    response_time_score: 0.5,
    streak_bonus: 0,
    snapshot_date: d,
    created_at: d,
  };
}

const testGoal: Goal = {
  id: 'goal-1',
  user_id: 'user-1',
  description: 'Run a 5K',
  timeline: '3 months',
  current_status: 'Just started',
  action_plan: { milestones: [], weekly_breakdown: [], daily_tasks: [] },
  goal_type: GoalType.OUTCOME,
  difficulty_level: 3,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('PlanAdjustmentService', () => {
  let service: PlanAdjustmentService;
  let mockScoreRepo: any;
  let mockGoalRepo: any;

  beforeEach(async () => {
    mockScoreRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    mockGoalRepo = {
      findOne: jest.fn().mockResolvedValue({ ...testGoal }),
      save: jest.fn(async (g: any) => g),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanAdjustmentService,
        { provide: getRepositoryToken(ExecutionScore), useValue: mockScoreRepo },
        { provide: getRepositoryToken(Goal), useValue: mockGoalRepo },
      ],
    }).compile();

    service = module.get<PlanAdjustmentService>(PlanAdjustmentService);
  });

  describe('evaluateAndAdjust', () => {
    it('reduces difficulty when score is below 30 for 3+ consecutive days', async () => {
      mockScoreRepo.find.mockResolvedValue([
        makeScore(25, 0),
        makeScore(20, 1),
        makeScore(15, 2),
      ]);
      await service.evaluateAndAdjust('user-1');
      expect(mockGoalRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ difficulty_level: 2 }),
      );
    });

    it('increases difficulty when score is above 80 for 7+ consecutive days', async () => {
      const highScores = Array.from({ length: 7 }, (_, i) => makeScore(85, i));
      mockScoreRepo.find.mockResolvedValue(highScores);
      await service.evaluateAndAdjust('user-1');
      expect(mockGoalRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ difficulty_level: 4 }),
      );
    });

    it('does not adjust when scores are between 30 and 80', async () => {
      mockScoreRepo.find.mockResolvedValue([
        makeScore(55, 0),
        makeScore(60, 1),
        makeScore(65, 2),
      ]);
      await service.evaluateAndAdjust('user-1');
      expect(mockGoalRepo.save).not.toHaveBeenCalled();
    });

    it('does not reduce difficulty below 1', async () => {
      mockGoalRepo.findOne.mockResolvedValue({ ...testGoal, difficulty_level: 1 });
      mockScoreRepo.find.mockResolvedValue([
        makeScore(10, 0), makeScore(10, 1), makeScore(10, 2),
      ]);
      await service.evaluateAndAdjust('user-1');
      expect(mockGoalRepo.save).not.toHaveBeenCalled();
    });

    it('does not increase difficulty above 5', async () => {
      mockGoalRepo.findOne.mockResolvedValue({ ...testGoal, difficulty_level: 5 });
      const highScores = Array.from({ length: 7 }, (_, i) => makeScore(90, i));
      mockScoreRepo.find.mockResolvedValue(highScores);
      await service.evaluateAndAdjust('user-1');
      expect(mockGoalRepo.save).not.toHaveBeenCalled();
    });

    it('does not adjust when fewer than 3 low scores exist', async () => {
      mockScoreRepo.find.mockResolvedValue([
        makeScore(20, 0),
        makeScore(20, 1),
      ]);
      await service.evaluateAndAdjust('user-1');
      expect(mockGoalRepo.save).not.toHaveBeenCalled();
    });

    it('does nothing when user has no goal', async () => {
      mockGoalRepo.findOne.mockResolvedValue(null);
      mockScoreRepo.find.mockResolvedValue([makeScore(10, 0), makeScore(10, 1), makeScore(10, 2)]);
      await expect(service.evaluateAndAdjust('user-1')).resolves.toBeUndefined();
    });
  });
});
