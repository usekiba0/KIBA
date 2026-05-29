import {
  Entity, Column, PrimaryColumn,
  Index,
} from 'typeorm';

export enum GhostState {
  ACTIVE = 'active',
  GHOST_1 = 'ghost_1',
  GHOST_2 = 'ghost_2',
  GHOST_3 = 'ghost_3',
  GHOST_4 = 'ghost_4',
  GHOST_5 = 'ghost_5',
  GHOST_6 = 'ghost_6',
}

/**
 * V5 PART 8 escalation cadence. Hour 2 is `onMissedCheckin` (scheduled by
 * the checkin-missed job +2h after the check-in fires). Levels 2-6 are
 * `onEscalate` chained jobs computed from the prior level's fire time.
 *
 * Delays are measured from the *previous level* — so total elapsed since
 * the original miss is the running sum of all delays up to that level.
 */
export const GHOST_LEVEL_DELAY_MS: Record<number, number> = {
  // ghost_1 fires at +2h via the checkin-missed job; no entry here.
  2: 3 * 60 * 60 * 1000,      // 5h elapsed (2h + 3h)
  3: 43 * 60 * 60 * 1000,     // d2 elapsed (5h + 43h = 48h)
  4: 24 * 60 * 60 * 1000,     // d3 (48h + 24h)
  5: 48 * 60 * 60 * 1000,     // d5 (72h + 48h)
  6: 48 * 60 * 60 * 1000,     // d7 (120h + 48h)
};

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
