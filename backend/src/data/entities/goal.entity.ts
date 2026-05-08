import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export interface ActionPlan {
  milestones: string[];
  weekly_breakdown: string[];
  daily_tasks: string[];
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

  @Column({ type: 'smallint', default: 3 })
  difficulty_level: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
