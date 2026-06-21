/**
 * Sanity-check a user's saved UTC offset against their phone's country calling
 * code. KIBA derives the offset from what the user TYPES during intake (a city,
 * or the model's guess) — so a tester role-playing a US city on a +92 number
 * ends up stored as UTC-5 when they're really UTC+5 (the "Ali" wrong-time case).
 *
 * We do NOT block or auto-correct — the typed value can be legitimate (the user
 * is travelling, or has a VoIP/foreign number). We only FLAG a gross mismatch so
 * it surfaces in logs/admin instead of KIBA silently confidently giving the wrong
 * local time. Tolerance is wide so only wrong-continent errors trip it, not DST
 * or zone-edge cases.
 */

// Country calling code -> plausible UTC offset range in minutes [min, max].
// Ranges (not points) cover countries spanning multiple zones and DST.
const CC_OFFSET_RANGE: Array<[cc: string, min: number, max: number]> = [
  // wide / multi-zone
  ['1', -600, -180], // US + Canada (Hawaii -600 .. Newfoundland ~-150)
  ['7', 180, 720], // Russia / Kazakhstan
  ['61', 480, 660], // Australia
  ['55', -300, -120], // Brazil
  ['52', -480, -300], // Mexico
  // narrow / single-zone
  ['44', 0, 60], // UK
  ['353', 0, 60], // Ireland
  ['351', 0, 60], // Portugal
  ['33', 60, 120], // France
  ['49', 60, 120], // Germany
  ['34', 60, 120], // Spain
  ['39', 60, 120], // Italy
  ['31', 60, 120], // Netherlands
  ['91', 330, 330], // India
  ['92', 300, 300], // Pakistan
  ['880', 360, 360], // Bangladesh
  ['971', 240, 240], // UAE
  ['966', 180, 180], // Saudi Arabia
  ['234', 60, 60], // Nigeria
  ['27', 120, 120], // South Africa
  ['63', 480, 480], // Philippines
  ['65', 480, 480], // Singapore
  ['81', 540, 540], // Japan
  ['82', 540, 540], // South Korea
  ['86', 480, 480], // China
  ['64', 720, 780], // New Zealand
];

// 1h slack for DST / zone edges, so only gross (wrong-continent) errors flag.
const TOLERANCE_MIN = 60;

/**
 * Expected offset range for a phone, or null when the country isn't in our table
 * (we then can't judge, and never flag). Longest calling-code prefix wins.
 */
export function expectedOffsetRangeForPhone(phone: string | null | undefined): [number, number] | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  const byLongestCode = [...CC_OFFSET_RANGE].sort((a, b) => b[0].length - a[0].length);
  for (const [cc, min, max] of byLongestCode) {
    if (digits.startsWith(cc)) return [min, max];
  }
  return null;
}

/**
 * true  = offset is plausible for the phone's country
 * false = gross mismatch (likely a wrong timezone capture)
 * null  = unknown country code — can't judge, caller should not flag
 */
export function isOffsetPlausibleForPhone(
  phone: string | null | undefined,
  offsetMinutes: number,
): boolean | null {
  const range = expectedOffsetRangeForPhone(phone);
  if (!range) return null;
  return offsetMinutes >= range[0] - TOLERANCE_MIN && offsetMinutes <= range[1] + TOLERANCE_MIN;
}
