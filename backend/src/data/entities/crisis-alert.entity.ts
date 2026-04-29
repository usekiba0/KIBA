import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

export enum DetectionMethod {
  KEYWORD = 'keyword',
  ML_CLASSIFIER = 'ml_classifier',
  HYBRID = 'hybrid',
}

export enum AlertChannel {
  SMS = 'sms',
  EMAIL = 'email',
}

export enum AlertStatus {
  OPEN = 'open',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
}

@Entity('crisis_alerts')
export class CrisisAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'uuid' })
  triggering_message_id: string;

  @Column({ type: 'enum', enum: DetectionMethod })
  detection_method: DetectionMethod;

  @Column({ type: 'decimal', precision: 4, scale: 3, nullable: true })
  confidence_score: number | null;

  @Column({ type: 'boolean', default: false })
  holding_message_sent: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  holding_message_sent_at: Date | null;

  @Column({ type: 'boolean', default: false })
  coach_alerted: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  coach_alerted_at: Date | null;

  @Column({ type: 'enum', enum: AlertChannel, nullable: true })
  coach_alert_channel: AlertChannel | null;

  @Index()
  @Column({ type: 'enum', enum: AlertStatus, default: AlertStatus.OPEN })
  status: AlertStatus;

  @Column({ type: 'varchar', length: 100, nullable: true })
  resolved_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolved_at: Date | null;

  @Index()
  @CreateDateColumn()
  created_at: Date;
}
