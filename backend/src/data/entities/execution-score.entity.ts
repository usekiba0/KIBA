import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, Index,
} from 'typeorm';

@Entity('execution_scores')
export class ExecutionScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'smallint' })
  current_score: number;

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  completion_rate: number;

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  proof_rate: number;

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  response_time_score: number;

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  streak_bonus: number;

  @Index()
  @Column({ type: 'date' })
  snapshot_date: Date;

  @CreateDateColumn()
  created_at: Date;
}
