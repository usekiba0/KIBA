import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('processed_stripe_events')
export class ProcessedStripeEvent {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  stripe_event_id: string;

  @Column({ type: 'varchar', length: 100 })
  event_type: string;

  @CreateDateColumn()
  processed_at: Date;
}
