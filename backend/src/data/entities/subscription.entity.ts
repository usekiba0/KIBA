import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum SubscriptionPlan {
  INDIVIDUAL = 'individual',
  COACH_PRO = 'coach_pro',
  COACH_ELITE = 'coach_elite',
}

export enum SubscriptionStatus {
  TRIALING = 'trialing',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELLED = 'cancelled',
}

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  user_id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  stripe_customer_id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  stripe_subscription_id: string;

  @Column({ type: 'enum', enum: SubscriptionPlan })
  plan: SubscriptionPlan;

  @Column({ type: 'enum', enum: SubscriptionStatus, default: SubscriptionStatus.TRIALING })
  status: SubscriptionStatus;

  @Column({ type: 'timestamptz' })
  trial_start: Date;

  @Column({ type: 'timestamptz' })
  trial_end: Date;

  @Column({ type: 'timestamptz', nullable: true })
  current_period_end: Date | null;

  // Stripe livemode of the subscription: true = real money (live key), false =
  // test-mode payment. NULL = created before we tracked it (legacy). MRR counts
  // ONLY real money — test-mode subscriptions must never inflate revenue
  // (Karibi 2026-07-08: dashboard showed $60 MRR from test conversions).
  @Column({ type: 'boolean', nullable: true })
  livemode: boolean | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
