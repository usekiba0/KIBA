import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

export enum SessionStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CRISIS_HOLD = 'crisis_hold',
}

@Entity('conversation_sessions')
export class ConversationSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @Index()
  @Column({ type: 'enum', enum: SessionStatus, default: SessionStatus.ACTIVE })
  status: SessionStatus;

  @Column({ type: 'integer', default: 0 })
  message_count: number;

  @Column({ type: 'boolean', default: false })
  summary_generated: boolean;

  @CreateDateColumn()
  started_at: Date;

  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  last_message_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  ended_at: Date | null;
}
