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

  @Column({ type: 'text', nullable: true })
  media_url: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  media_content_type: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50, nullable: true })
  twilio_sid: string | null;

  @Column({ type: 'integer', nullable: true })
  token_count: number | null;

  @Column({ type: 'boolean', default: false })
  flagged: boolean;

  @Column({ type: 'text', nullable: true })
  flag_reason: string | null;

  @Index()
  @CreateDateColumn()
  created_at: Date;
}
