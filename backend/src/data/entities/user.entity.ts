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

/**
 * Which onboarding flavour a cold lead landed in, derived from the ad's
 * pre-filled SMS deep-link text on their FIRST inbound message (added
 * 2026-06-02). Lets different ads open with a different first reply while still
 * funnelling into the same intake → payment flow. Captured once at lead
 * creation and never changed after.
 */
export enum OnboardingVariant {
  /** Default — no recognised keyword, or an organic/unknown first message. */
  STANDARD = 'standard',
  /** Ad pre-fill like "what even is kiba" — answer the question first, then gather. */
  EXPLAINER = 'explainer',
  /** Ad pre-fill like "what's up kiba" — warm peer opener, then gather. */
  CASUAL = 'casual',
}

export interface IntakeData {
  goal_description?: string;
  goal_timeline?: string;
  current_status?: string;
  // Why the main goal actually matters to them — the emotional driver captured
  // during the conversion-optimized intake build (Text 4/5 of the sales flow).
  // Read back by the coaching prompt to keep KIBA's pushes personal.
  why_it_matters?: string;
  fears?: string;
  avoidance_patterns?: string;
  comparison_figure?: string;
  public_failure_scenario?: string;
  typical_failure_moment?: string;
  pressure_preference?: 'pressure' | 'encouragement';
  // Whether the user has explicitly opted in to KIBA cursing. False by default
  // (no cursing without consent). Mirrored to PsychologicalProfile.cussing_ok.
  cussing_ok?: boolean;
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

  // Ad-attributed onboarding flavour, set once from the first inbound's
  // pre-filled deep-link text. Defaults to STANDARD for organic / web signups.
  @Column({ type: 'enum', enum: OnboardingVariant, default: OnboardingVariant.STANDARD })
  onboarding_variant: OnboardingVariant;

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

  // ── Tier 1 derived signals (added 2026-05-29) ──────────────────────────────
  // Per-DOW miss counter (Sun=0..Sat=6) in the user's LOCAL clock. Incremented
  // by StrikeService when a task is marked missed. Drives V5 predictive warnings
  // — coaching prompt reads this and the AI can call out a weakest day naturally
  // without us scheduling a separate Thursday-night cron.
  @Column({ type: 'integer', array: true, default: () => "'{0,0,0,0,0,0,0}'" })
  miss_counts_by_dow: number[];

  // Largest streak we've already celebrated (3/7/14/30 milestone). Used to
  // dedupe the auto-fire celebration so a user doesn't get the "7 days" message
  // twice. ProofService updates this after firing the milestone.
  @Column({ type: 'integer', default: 0 })
  last_milestone_hit: number;

  // Last weak-excuse phrase the user offered (trimmed). Lets the coaching prompt
  // call back on "second time you said 'too tired'" without an LLM extractor.
  @Column({ type: 'varchar', length: 200, nullable: true })
  last_excuse_phrase: string | null;

  // Consecutive count of the same excuse phrase. Resets when user breaks the
  // pattern (different excuse OR succeeds). Used by the prompt to escalate
  // call-outs at 2nd/3rd repeat per V5 PART 7.
  @Column({ type: 'integer', default: 0 })
  same_excuse_count: number;

  // User-LOCAL calendar day (YYYY-MM-DD) of the last check-in actually sent.
  // Claimed atomically by CheckinProcessor before each send so the daily
  // check-in can never fire more than once per local day, no matter how many
  // schedulers race at fire time (bugfix 2026-06-01).
  @Column({ type: 'varchar', length: 10, nullable: true })
  last_checkin_date: string | null;
}
