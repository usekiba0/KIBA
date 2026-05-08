import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, Index,
} from 'typeorm';

@Entity('strikes')
export class Strike {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'uuid' })
  daily_task_id: string;

  @Column({ type: 'smallint' })
  escalation_level: number;

  @CreateDateColumn()
  created_at: Date;
}
