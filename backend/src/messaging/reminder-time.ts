import { computeLocalDelayMs } from '../accountability/schedule-time.util';

/**
 * Deterministic reminder-time resolution.
 *
 * Haiku is unreliable at timezone + relative-time arithmetic — in Karibi's chat
 * it answered "about 3 minutes from now" when the user said one minute, and
 * "set for 30 mins" when the user said five hours. So we stop letting the model
 * compute fire times. The model passes a RELATIVE delay or a LOCAL clock time
 * and the server computes the exact UTC instant here. `fire_at_iso` remains a
 * last-resort fallback for anything the model can only express as an ISO time.
 */
export interface ReminderTimeInput {
  /** Relative: minutes from now (e.g. "in 5 hours" -> 300). Server adds to now. */
  delay_minutes?: number | null;
  /** Absolute local wall-clock "HH:MM" 24h. Server converts via the user offset. */
  local_clock?: string | null;
  /** Legacy fallback: a UTC ISO-8601 instant the model computed itself. */
  fire_at_iso?: string | null;
}

export type ResolveResult =
  | { ok: true; fireAt: Date }
  | { ok: false; error: string };

/** Resolve the UTC fire instant from whatever the model supplied. */
export function resolveReminderFireAt(
  input: ReminderTimeInput,
  utcOffsetMinutes: number | null | undefined,
  now: number = Date.now(),
): ResolveResult {
  // 1) Relative delay — fully deterministic, no timezone needed.
  if (input.delay_minutes !== undefined && input.delay_minutes !== null) {
    const m = Number(input.delay_minutes);
    if (!Number.isFinite(m) || m <= 0) {
      return { ok: false, error: 'delay_minutes must be a positive number' };
    }
    return { ok: true, fireAt: new Date(now + m * 60_000) };
  }

  // 2) Absolute local clock — server does the local->UTC conversion.
  if (input.local_clock) {
    if (!/^\d{1,2}:\d{2}$/.test(input.local_clock)) {
      return { ok: false, error: 'local_clock must be "HH:MM" 24h' };
    }
    if (utcOffsetMinutes === null || utcOffsetMinutes === undefined) {
      return { ok: false, error: "need the user's timezone to schedule a clock time — ask first" };
    }
    const delay = computeLocalDelayMs(input.local_clock, utcOffsetMinutes, now);
    return { ok: true, fireAt: new Date(now + delay) };
  }

  // 3) Legacy fallback: a model-computed ISO instant.
  if (input.fire_at_iso) {
    const d = new Date(input.fire_at_iso);
    if (isNaN(d.getTime())) {
      return { ok: false, error: 'fire_at_iso is not a valid ISO date' };
    }
    return { ok: true, fireAt: d };
  }

  return { ok: false, error: 'no time given — pass delay_minutes, local_clock, or fire_at_iso' };
}

/**
 * Human "fires in X" string computed from a millisecond delta, so the model can
 * echo the system's number instead of computing (and fumbling) its own.
 */
export function humanizeFireDelta(ms: number): string {
  if (ms < 60_000) return 'in under a minute';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `in ${h}h ${m}m` : `in ${h}h`;
}
