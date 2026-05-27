import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, Index,
} from 'typeorm';

export enum DailyTodoStatus {
  OPEN = 'open',
  DONE = 'done',
  SKIPPED = 'skipped',
}

export enum DailyTodoSource {
  /** Auto-seeded from goal.action_plan.daily_tasks on the first message of the day. */
  PLAN = 'plan',
  /** Added by the user via chat. */
  USER = 'user',
  /** Added by the coaching AI mid-conversation. */
  AI = 'ai',
}

/**
 * Per-day editable to-do list distinct from `DailyTask` (which is the singular
 * proof-bound "headline task" wired into morning check-ins and strikes).
 * `DailyTodo` is the multi-item list the coaching AI reads at the top of every
 * turn so it knows what the user is supposed to be doing today and what's
 * already done — fixes the "what's the workout?" loop where the AI kept asking
 * even though `goal.action_plan.daily_tasks` already had the answer.
 */
@Entity('daily_todos')
@Index('IDX_daily_todos_user_date', ['user_id', 'scheduled_date'])
export class DailyTodo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'date' })
  scheduled_date: Date;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'enum', enum: DailyTodoStatus, default: DailyTodoStatus.OPEN })
  status: DailyTodoStatus;

  @Column({ type: 'enum', enum: DailyTodoSource, default: DailyTodoSource.USER })
  source: DailyTodoSource;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
