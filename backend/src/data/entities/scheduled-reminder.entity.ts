import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

export enum ScheduledReminderStatus {
  PENDING = 'pending',
  FIRED = 'fired',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

export enum ReminderRecurrence {
  DAILY = 'daily',
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

  // null = one-off. 'daily' = re-enqueue 24h after each fire using
  // recurrence_local_time + recurrence_offset_minutes. Snapshotted at creation
  // so the reminder stays at the local clock-time the user asked for, even if
  // their user.utc_offset_minutes changes later.
  @Column({ type: 'varchar', length: 20, nullable: true })
  recurrence_rule: ReminderRecurrence | null;

  @Column({ type: 'varchar', length: 5, nullable: true })
  recurrence_local_time: string | null;

  @Column({ type: 'integer', nullable: true })
  recurrence_offset_minutes: number | null;

  // First row in a recurring chain points to itself (set after insert). Each
  // re-enqueued occurrence carries the same parent_id so `cancel(parent_id)`
  // can stop a whole series in one call.
  @Index()
  @Column({ type: 'uuid', nullable: true })
  recurrence_parent_id: string | null;

  @CreateDateColumn()
  created_at: Date;
}
