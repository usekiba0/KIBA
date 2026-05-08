import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, Index,
} from 'typeorm';

export enum ProofType {
  PHOTO = 'photo',
  TEXT = 'text',
}

export enum ProofValidationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

@Entity('proofs')
export class Proof {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  task_id: string;

  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'enum', enum: ProofType })
  proof_type: ProofType;

  @Column({ type: 'text', nullable: true })
  media_url: string | null;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ type: 'enum', enum: ProofValidationStatus, default: ProofValidationStatus.PENDING })
  validation_status: ProofValidationStatus;

  @Column({ type: 'timestamptz', nullable: true })
  validated_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
