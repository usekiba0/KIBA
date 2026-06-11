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
