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

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  phone_number: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'enum', enum: CoachingFocus })
  coaching_focus: CoachingFocus;

  @Column({ type: 'text' })
  goals: string;

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

  @CreateDateColumn()
  registered_at: Date;

  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  last_active_at: Date | null;
}
