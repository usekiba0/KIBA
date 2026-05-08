import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, Index,
} from 'typeorm';

export enum TaskStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  MISSED = 'missed',
  RECOVERY = 'recovery',
}

@Entity('daily_tasks')
export class DailyTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  goal_id: string;

  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'text' })
  task_description: string;

  @Index()
  @Column({ type: 'date' })
  scheduled_date: Date;

  @Column({ type: 'enum', enum: TaskStatus, default: TaskStatus.PENDING })
  status: TaskStatus;

  @Column({ type: 'uuid', nullable: true })
  proof_id: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  completion_timestamp: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
