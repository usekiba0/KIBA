import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum CorrectionStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  APPENDED = 'appended',
  REJECTED = 'rejected',
}

@Entity('corrections')
export class Correction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'uuid', nullable: true })
  triggering_message_id: string | null;

  @Column({ type: 'text' })
  correction_text: string;

  @Column({ type: 'text', nullable: true })
  ai_analysis: string | null;

  @Column({ type: 'smallint', nullable: true })
  ai_validity_score: number | null;

  @Column({ type: 'text', nullable: true })
  ai_suggested_knowledge: string | null;

  @Index()
  @Column({ type: 'enum', enum: CorrectionStatus, default: CorrectionStatus.PENDING })
  status: CorrectionStatus;

  @Column({ type: 'uuid', nullable: true })
  knowledge_id: string | null;

  @Column({ type: 'text', nullable: true })
  admin_note: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reviewed_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewed_at: Date | null;

  @Index()
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
