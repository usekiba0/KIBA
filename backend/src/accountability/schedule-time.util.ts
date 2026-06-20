/**
 * Delay in ms from `now` until the next occurrence of a "HH:mm" wall-clock time
 * in the user's local timezone (expressed as a UTC offset in minutes). If that
 * local time has already passed today, the next occurrence is tomorrow.
 *
 * Extracted so the morning check-in and the night recap share one correct
 * local→UTC conversion. `now` is injectable for deterministic tests.
 */
export function computeLocalDelayMs(
  localTime: string,
  utcOffsetMinutes = 0,
  now: number = Date.now(),
): number {
  const [hours, minutes] = localTime.split(':').map(Number);

  // Convert the user's local wall-clock minute → UTC by subtracting their offset.
  const localTotalMins = hours * 60 + minutes;
  const utcTotalMins = (((localTotalMins - utcOffsetMinutes) % 1440) + 1440) % 1440;
  const utcH = Math.floor(utcTotalMins / 60);
  const utcM = utcTotalMins % 60;

  const nowDate = new Date(now);
  const target = new Date(nowDate);
  target.setUTCHours(utcH, utcM, 0, 0);

  if (target.getTime() <= nowDate.getTime()) {
    target.setUTCDate(target.getUTCDate() + 1);
  }

  return target.getTime() - nowDate.getTime();
}

/**
 * Delay in ms from `now` until the next occurrence of a given weekday at a
 * "HH:mm" local wall-clock time, in the user's timezone (UTC offset in minutes).
 * `weekday` is 0=Sunday..6=Saturday in the user's LOCAL time. If that weekday +
 * time hasn't passed this week it fires this week, otherwise next week.
 *
 * Used by the weekly review (mirrors computeLocalDelayMs for the nightly recap).
 */
export function computeWeeklyDelayMs(
  weekday: number,
  localTime: string,
  utcOffsetMinutes = 0,
  now: number = Date.now(),
): number {
  const [hours, minutes] = localTime.split(':').map(Number);

  // Work in "local-shifted" ms (UTC fields represent the user's local clock).
  const localNowMs = now + utcOffsetMinutes * 60_000;
  const target = new Date(localNowMs);
  target.setUTCHours(hours, minutes, 0, 0);

  // Advance to the desired local weekday.
  const dayDiff = (((weekday - target.getUTCDay()) % 7) + 7) % 7;
  target.setUTCDate(target.getUTCDate() + dayDiff);

  // If that instant is already past (same weekday, time gone), roll a week.
  if (target.getTime() <= localNowMs) {
    target.setUTCDate(target.getUTCDate() + 7);
  }

  // Convert the local-shifted target back to real UTC.
  const targetUtcMs = target.getTime() - utcOffsetMinutes * 60_000;
  return targetUtcMs - now;
}
