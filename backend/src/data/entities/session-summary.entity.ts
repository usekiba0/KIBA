import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

export enum SummaryTrigger {
  SESSION_EXPIRY = 'session_expiry',
  MESSAGE_COUNT = 'message_count',
  TOKEN_BUDGET = 'token_budget',
}

@Entity('session_summaries')
export class SessionSummary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'uuid' })
  session_id: string;

  @Column({ type: 'text' })
  summary: string;

  @Column({ type: 'integer' })
  message_count_summarised: number;

  @Column({ type: 'enum', enum: SummaryTrigger })
  trigger: SummaryTrigger;

  @CreateDateColumn()
  created_at: Date;
}
