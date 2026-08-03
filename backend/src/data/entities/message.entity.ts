import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum MessageRole {
  USER = 'user',
  AI = 'ai',
}

export enum MessageType {
  TEXT = 'text',
  MMS = 'mms',
}

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  session_id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'enum', enum: MessageRole })
  role: MessageRole;

  @Column({ type: 'enum', enum: MessageType, default: MessageType.TEXT })
  message_type: MessageType;

  @Column({ type: 'text' })
  content: string;

  // Entry [0] of the batch below. Kept because every historical row has it and
  // several read paths (admin API, proof submission) still want a single photo.
  @Column({ type: 'text', nullable: true })
  media_url: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  media_content_type: string | null;

  // The FULL ordered attachment batch for this turn. A multi-photo send arrives
  // as one webhook per photo and the debouncer merges them, so a single row can
  // legitimately carry four images — storing only media_url meant photo recall
  // and the admin thread view saw one image for a turn that carried several
  // (Karibi 2026-08-03). Backfilled to a one-entry array for legacy rows, so
  // readers can treat these as authoritative and never branch on NULL.
  @Column({ type: 'jsonb', nullable: true })
  media_urls: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  media_content_types: string[] | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50, nullable: true })
  twilio_sid: string | null;

  // Provider inbound id (SendBlue/iMessage message_handle). The cross-instance
  // idempotency key: the inbound row is saved before any reply, and this unique
  // column makes a re-delivered webhook fail the insert instead of spawning a
  // second reply. SMS already had this via twilio_sid; iMessage had no equivalent
  // (Karibi 2026-07-08 — duplicate replies). NULL for AI rows / legacy inbounds.
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, nullable: true })
  provider_message_id: string | null;

  @Column({ type: 'integer', nullable: true })
  token_count: number | null;

  @Column({ type: 'boolean', default: false })
  is_checkin_prompt: boolean;

  // Which scheduled/triggered sender class produced this AI row (checkin, recap,
  // ghost, reminder, surprise, dunning, intake_nudge, price_reveal, milestone,
  // weekly_review). NULL for live coaching replies and user rows. Gives every
  // scheduled class a DB-visible fired record and lets the coaching context
  // label machine-sent turns.
  @Column({ type: 'varchar', length: 32, nullable: true })
  scheduled_kind: string | null;

  @Column({ type: 'boolean', default: false })
  is_proof_submission: boolean;

  @Column({ type: 'boolean', default: false })
  flagged: boolean;

  @Column({ type: 'text', nullable: true })
  flag_reason: string | null;

  @Index()
  @CreateDateColumn()
  created_at: Date;
}
