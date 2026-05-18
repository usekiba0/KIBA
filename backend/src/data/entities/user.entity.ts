import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

export enum CoachingFocus {
  FITNESS = 'fitness',
  NUTRITION = 'nutrition',
  WELLNESS = 'wellness',
  COMBINED = 'combined',
}

export enum UserStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  PAUSED = 'paused',
  CANCELLED = 'cancelled',
}

export enum OnboardingStage {
  /** Cold lead — AI is gathering intake data conversationally over SMS. */
  INTAKE = 'intake',
  /** AI sent the Stripe payment link; awaiting checkout completion. */
  PAYMENT_PENDING = 'payment_pending',
  /** Paid (either via SMS link or the existing web form). Coaching is unlocked. */
  COMPLETE = 'complete',
}

export interface IntakeData {
  goal_description?: string;
  goal_timeline?: string;
  current_status?: string;
  fears?: string;
  avoidance_patterns?: string;
  comparison_figure?: string;
  public_failure_scenario?: string;
  typical_failure_moment?: string;
  pressure_preference?: 'pressure' | 'encouragement';
  // Free-form notes the AI captures that don't fit the structured fields
  notes?: string[];
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  phone_number: string;

  // Nullable for SMS-first cold leads who haven't shared a name yet
  @Column({ type: 'varchar', length: 100, nullable: true })
  name: string | null;

  // Nullable for SMS-first cold leads
  @Column({ type: 'enum', enum: CoachingFocus, nullable: true })
  coaching_focus: CoachingFocus | null;

  // Nullable for SMS-first cold leads
  @Column({ type: 'text', nullable: true })
  goals: string | null;

  @Column({ type: 'smallint', nullable: true })
  height_cm: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  weight_kg: number | null;

  @Column({ type: 'smallint', nullable: true })
  age: number | null;

  @Column({ type: 'text', array: true, default: '{}' })
  health_conditions: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  dietary_restrictions: string[];

  @Column({ type: 'text', nullable: true })
  injuries: string | null;

  @Index()
  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.TRIAL })
  status: UserStatus;

  @Column({ type: 'boolean', default: false })
  crisis_hold: boolean;

  @Column({ type: 'varchar', length: 5, nullable: true })
  checkin_time: string | null;

  @Column({ type: 'smallint', nullable: true })
  utc_offset_minutes: number | null;

  @Index()
  @Column({ type: 'enum', enum: OnboardingStage, default: OnboardingStage.COMPLETE })
  onboarding_stage: OnboardingStage;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  intake_data: IntakeData;

  @Column({ type: 'timestamptz', nullable: true })
  payment_link_sent_at: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  stripe_checkout_session_id: string | null;

  @Column({ type: 'boolean', default: false })
  sample_coaching_given: boolean;

  @Column({ type: 'smallint', default: 0 })
  dunning_nudges_sent: number;

  @CreateDateColumn()
  registered_at: Date;

  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  last_active_at: Date | null;
}
