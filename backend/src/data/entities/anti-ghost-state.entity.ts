import {
  Entity, Column, PrimaryColumn,
  Index,
} from 'typeorm';

export enum GhostState {
  ACTIVE = 'active',
  GHOST_1 = 'ghost_1',
  GHOST_2 = 'ghost_2',
  GHOST_3 = 'ghost_3',
}

@Entity('anti_ghost_states')
export class AntiGhostState {
  @PrimaryColumn({ type: 'uuid' })
  user_id: string;

  @Index()
  @Column({ type: 'enum', enum: GhostState, default: GhostState.ACTIVE })
  state: GhostState;

  @Column({ type: 'timestamptz' })
  last_response_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  next_escalation_at: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  current_job_id: string | null;
}
