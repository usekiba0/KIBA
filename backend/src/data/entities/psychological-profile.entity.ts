import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum PressurePreference {
  PRESSURE = 'pressure',
  ENCOURAGEMENT = 'encouragement',
}

@Entity('psychological_profiles')
export class PsychologicalProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'text' })
  fears: string;

  @Column({ type: 'text' })
  avoidance_patterns: string;

  @Column({ type: 'text' })
  comparison_figure: string;

  @Column({ type: 'text' })
  public_failure_scenario: string;

  @Column({ type: 'text' })
  typical_failure_moment: string;

  @Column({ type: 'enum', enum: PressurePreference })
  pressure_preference: PressurePreference;

  /**
   * Whether the user has explicitly opted in to KIBA cursing in messages. Defaults
   * to false — we never cuss without consent. Set during SMS onboarding via the
   * "cussing — cool with it or keep it pg?" question, or via save_intake_field /
   * save_profile_field mid-conversation.
   */
  @Column({ type: 'boolean', default: false })
  cussing_ok: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
