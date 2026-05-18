import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

export enum ScheduledReminderStatus {
  PENDING = 'pending',
  FIRED = 'fired',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

@Entity('scheduled_reminders')
export class ScheduledReminder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'uuid', nullable: true })
  session_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  created_by_message_id: string | null;

  @Index()
  @Column({ type: 'timestamptz' })
  fire_at: Date;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bull_job_id: string | null;

  @Index()
  @Column({ type: 'enum', enum: ScheduledReminderStatus, default: ScheduledReminderStatus.PENDING })
  status: ScheduledReminderStatus;

  @Column({ type: 'timestamptz', nullable: true })
  fired_at: Date | null;

  @Column({ type: 'text', nullable: true })
  failure_reason: string | null;

  @CreateDateColumn()
  created_at: Date;
}
