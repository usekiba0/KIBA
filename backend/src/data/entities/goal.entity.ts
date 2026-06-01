import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export interface ActionPlan {
  milestones: string[];
  weekly_breakdown: string[];
  daily_tasks: string[];
}

/**
 * Goal Type (Karibi feedback 2026-06-01). Drives whether proactive copy asks
 * "did it happen?" (TASK only) vs "what's the move today?" (everything else).
 * Set deterministically by classifyGoalType() at plan-generation time.
 */
export enum GoalType {
  /** Long-term measurable result: make 100k/month, lose 30 lbs, build a company. */
  OUTCOME = 'outcome',
  /** Recurring habit: gym 4x/week, post daily, sleep by 11. */
  HABIT = 'habit',
  /** One-time deliverable with a deadline: send email, finish landing page. */
  TASK = 'task',
  /** Identity / behavior pattern: become disciplined, stop procrastinating. */
  IDENTITY = 'identity',
  /** Emotional / life issue: overthinking, feeling lost, stress, family. */
  EMOTIONAL = 'emotional',
}

@Entity('goals')
export class Goal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 100 })
  timeline: string;

  @Column({ type: 'text' })
  current_status: string;

  @Column({ type: 'jsonb', nullable: true })
  action_plan: ActionPlan;

  @Column({ type: 'varchar', length: 20, default: GoalType.OUTCOME })
  goal_type: GoalType;

  @Column({ type: 'smallint', default: 3 })
  difficulty_level: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
