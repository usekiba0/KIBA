export const REMINDER_REGEX = /\b(remind|reminder|alarm|alert me|ping me|text me|message me|hit me up|wake me up|check in on me|send me a reminder)\b.{0,40}(\bat\b|\bin+\b|\b@\b)/i;

export function parseReminderTime(text: string): string | null {
  // Prefer time explicitly after "at" — avoids grabbing "It's 5:18pm rn" instead of "at 5:20"
  const match = text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
    ?? text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2] ?? '0', 10);
  const period = match[3].toLowerCase();

  if (period === 'pm' && hours !== 12) hours += 12;
  if (period === 'am' && hours === 12) hours = 0;

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

const BARE_NUMBER_MAX_MINUTES = 120;

export function parseRelativeDelayMs(text: string): number | null {
  // `in+` tolerates the common "inn" typo. Unit captures min/mins/minute/minutes/hr/hrs/hour/hours.
  const withUnit = text.match(/\bin+\s+(\d+)\s*(min(?:utes?|s)?|hrs?|hours?)\b/i);
  if (withUnit) {
    const amount = parseInt(withUnit[1], 10);
    const unit = withUnit[2].toLowerCase();
    if (unit.startsWith('min')) return amount * 60_000;
    if (unit.startsWith('h')) return amount * 3_600_000;
  }
  // Bare number, no unit — assume minutes when plausible (e.g. "remind me in 30").
  // Above the cap, intent is ambiguous (could be a date, weight, count); refuse to guess.
  const bare = text.match(/\bin+\s+(\d+)\b/i);
  if (bare) {
    const amount = parseInt(bare[1], 10);
    if (amount > 0 && amount <= BARE_NUMBER_MAX_MINUTES) return amount * 60_000;
  }
  return null;
}

const NAMED_TZ_OFFSETS: Record<string, number> = {
  pst: -480, pdt: -420, mst: -420, mdt: -360, cst: -360, cdt: -300,
  est: -300, edt: -240, ast: -240, gmt: 0, utc: 0, bst: 60, cet: 60,
  eet: 120, msk: 180, ist: 330, pkt: 300, bst_bd: 360, ict: 420,
  cst_cn: 480, sgt: 480, jst: 540, kst: 540, aest: 600, nzst: 720,
};

export function parseTimezoneOffset(text: string): number | null {
  // Match UTC/GMT±offset e.g. "UTC+5", "GMT-5:30", "UTC +5"
  const utcMatch = text.match(/\b(?:utc|gmt)\s*([+-])\s*(\d{1,2})(?::(\d{2}))?\b/i);
  if (utcMatch) {
    const sign = utcMatch[1] === '+' ? 1 : -1;
    const h = parseInt(utcMatch[2], 10);
    const m = parseInt(utcMatch[3] ?? '0', 10);
    return sign * (h * 60 + m);
  }
  // Match named zone + optional offset e.g. "PKT+5", "PKT", "EST"
  const namedMatch = text.match(/\b(pst|pdt|mst|mdt|cst|cdt|est|edt|ast|gmt|bst|cet|eet|msk|pkt|ict|sgt|jst|kst|aest|nzst|ist)\s*(?:[+-]\s*\d{1,2})?\b/i);
  if (namedMatch) {
    const key = namedMatch[1].toLowerCase();
    return NAMED_TZ_OFFSETS[key] ?? null;
  }
  return null;
}

export function formatDisplayTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const displayM = m > 0 ? `:${String(m).padStart(2, '0')}` : '';
  return `${displayH}${displayM}${period}`;
}
