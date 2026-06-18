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

// US Daylight Saving promotion: most users in the US/Canada type the WINTER
// abbreviation (CST, EST, PST, MST) year-round because it's what they've
// always called it. During DST months we should treat those as the summer
// variant or every reminder lands 1 hour off.
const US_DST_PROMOTIONS: Record<string, string> = {
  pst: 'pdt', mst: 'mdt', cst: 'cdt', est: 'edt',
};

/**
 * True if the given UTC moment falls in US Daylight Saving Time, which runs
 * from the 2nd Sunday of March (2am local) to the 1st Sunday of November (2am local).
 */
export function isUsDstActive(now: Date): boolean {
  const year = now.getUTCFullYear();
  // 2nd Sunday of March, 2am EST = 07:00 UTC
  const march1 = new Date(Date.UTC(year, 2, 1));
  const firstSundayMarch = 1 + ((7 - march1.getUTCDay()) % 7);
  const dstStart = new Date(Date.UTC(year, 2, firstSundayMarch + 7, 7));
  // 1st Sunday of November, 2am EDT = 06:00 UTC
  const nov1 = new Date(Date.UTC(year, 10, 1));
  const firstSundayNov = 1 + ((7 - nov1.getUTCDay()) % 7);
  const dstEnd = new Date(Date.UTC(year, 10, firstSundayNov, 6));
  return now >= dstStart && now < dstEnd;
}

/**
 * Resolve a named-zone key (e.g. "cst", "pkt") to its UTC offset in minutes,
 * promoting US winter names to their summer variant when DST is currently active.
 */
function resolveNamedOffset(key: string, now: Date): number | null {
  let k = key.toLowerCase();
  if (US_DST_PROMOTIONS[k] && isUsDstActive(now)) {
    k = US_DST_PROMOTIONS[k];
  }
  return NAMED_TZ_OFFSETS[k] ?? null;
}

export function parseTimezoneOffset(text: string, now: Date = new Date()): number | null {
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
    // Auto-promote US winter names (CST/EST/MST/PST) to their summer variant
    // when DST is currently active. Users typing the winter form in May/June/etc.
    // almost always mean their local clock, not the literal standard offset.
    return resolveNamedOffset(namedMatch[1], now);
  }
  return null;
}

// Major cities → either a NAMED_TZ key (DST-aware via resolveNamedOffset) or a
// fixed UTC-offset number (for zones that don't observe DST, e.g. Arizona,
// Hawaii, most of Asia). Onboarding asks "what city are you in?" instead of a
// timezone — users answer with a city, never a UTC offset — so we resolve the
// offset deterministically in code instead of relying on the model to compute it
// and remember to call the save tool (it didn't, and re-asked forever).
const CITY_TO_TZ: Record<string, string | number> = {
  // US Eastern
  'new york city': 'est', 'new york': 'est', nyc: 'est', manhattan: 'est',
  brooklyn: 'est', queens: 'est', bronx: 'est', boston: 'est',
  philadelphia: 'est', philly: 'est', 'washington dc': 'est', washington: 'est',
  baltimore: 'est', atlanta: 'est', miami: 'est', orlando: 'est', tampa: 'est',
  jacksonville: 'est', charlotte: 'est', raleigh: 'est', durham: 'est',
  pittsburgh: 'est', detroit: 'est', cleveland: 'est', columbus: 'est',
  cincinnati: 'est', indianapolis: 'est', richmond: 'est', buffalo: 'est',
  // US Central
  chicago: 'cst', houston: 'cst', dallas: 'cst', austin: 'cst',
  'san antonio': 'cst', 'fort worth': 'cst', 'new orleans': 'cst',
  memphis: 'cst', nashville: 'cst', 'kansas city': 'cst', 'st louis': 'cst',
  'saint louis': 'cst', milwaukee: 'cst', minneapolis: 'cst', 'st paul': 'cst',
  'oklahoma city': 'cst', omaha: 'cst', tulsa: 'cst', madison: 'cst',
  'des moines': 'cst', 'little rock': 'cst',
  // US Mountain (DST-observing)
  denver: 'mst', 'colorado springs': 'mst', 'salt lake city': 'mst',
  albuquerque: 'mst', boise: 'mst', 'el paso': 'mst', cheyenne: 'mst',
  billings: 'mst',
  // Arizona — Mountain offset but NO DST, so fixed -420 year-round
  phoenix: -420, tucson: -420, mesa: -420, scottsdale: -420, tempe: -420,
  // US Pacific
  'los angeles': 'pst', la: 'pst', 'san francisco': 'pst', sf: 'pst',
  'san diego': 'pst', sacramento: 'pst', 'san jose': 'pst', oakland: 'pst',
  fresno: 'pst', 'long beach': 'pst', seattle: 'pst', portland: 'pst',
  'las vegas': 'pst', vegas: 'pst', reno: 'pst', spokane: 'pst', tacoma: 'pst',
  // US Alaska / Hawaii (Hawaii has no DST)
  anchorage: -540, honolulu: -600, hawaii: -600,
  // Canada
  toronto: 'est', ottawa: 'est', montreal: 'est', vancouver: 'pst',
  calgary: 'mst', edmonton: 'mst', winnipeg: 'cst', halifax: 'ast',
  // International (fixed offsets — approximate; the model can refine DST edges)
  london: 'gmt', dublin: 'gmt', 'mexico city': -360, karachi: 'pkt',
  lahore: 'pkt', islamabad: 'pkt', dubai: 240, mumbai: 'ist', delhi: 'ist',
  'new delhi': 'ist', bangalore: 'ist', bengaluru: 'ist', hyderabad: 'ist',
  singapore: 'sgt', 'hong kong': 480, tokyo: 'jst', seoul: 'kst',
  sydney: 'aest', melbourne: 'aest', brisbane: 600, perth: 480,
  auckland: 'nzst', wellington: 'nzst', paris: 'cet', berlin: 'cet',
  madrid: 'cet', barcelona: 'cet', rome: 'cet', milan: 'cet', amsterdam: 'cet',
  munich: 'cet', frankfurt: 'cet', vienna: 'cet', zurich: 'cet',
  brussels: 'cet', stockholm: 'cet', oslo: 'cet', copenhagen: 'cet',
  warsaw: 'cet', athens: 'eet', helsinki: 'eet', lagos: 60, accra: 0,
  nairobi: 180, johannesburg: 120, 'cape town': 120, cairo: 120, casablanca: 0,
  istanbul: 180, riyadh: 180, doha: 180, 'abu dhabi': 240, 'tel aviv': 120,
  'sao paulo': -180, 'rio de janeiro': -180, 'buenos aires': -180,
  bogota: -300, lima: -300, guadalajara: -360, monterrey: -360, tijuana: 'pst',
  shanghai: 480, beijing: 480, shenzhen: 480, guangzhou: 480, taipei: 480,
  chennai: 'ist', kolkata: 'ist', pune: 'ist', ahmedabad: 'ist', osaka: 'jst',
  busan: 'kst', manila: 480, jakarta: 420, bangkok: 'ict', 'kuala lumpur': 480,
  'ho chi minh': 'ict', hanoi: 'ict', manchester: 'gmt', glasgow: 'gmt',
  edinburgh: 'gmt', leeds: 'gmt',

  // ── Additional US metros (curated: unambiguous, populous; ambiguous names
  // shared across zones like Springfield/Aurora/Glendale/Salem/Arlington are
  // intentionally OMITTED so we never guess the wrong offset) ──
  // Texas + Central
  plano: 'cst', frisco: 'cst', mckinney: 'cst', irving: 'cst', garland: 'cst',
  lubbock: 'cst', laredo: 'cst', amarillo: 'cst', waco: 'cst', denton: 'cst',
  'sugar land': 'cst', 'corpus christi': 'cst', wichita: 'cst',
  'baton rouge': 'cst', shreveport: 'cst', birmingham: 'cst', montgomery: 'cst',
  huntsville: 'cst', 'sioux falls': 'cst', fargo: 'cst',
  // California + Pacific
  anaheim: 'pst', 'santa ana': 'pst', riverside: 'pst', irvine: 'pst',
  bakersfield: 'pst', stockton: 'pst', fremont: 'pst', 'chula vista': 'pst',
  'huntington beach': 'pst', eugene: 'pst', bellevue: 'pst', everett: 'pst',
  // Eastern
  newark: 'est', 'jersey city': 'est', 'virginia beach': 'est', norfolk: 'est',
  greensboro: 'est', 'winston salem': 'est', 'fort lauderdale': 'est',
  tallahassee: 'est', louisville: 'est', lexington: 'est', savannah: 'est',
  syracuse: 'est', hartford: 'est', providence: 'est', worcester: 'est',
  'new haven': 'est', allentown: 'est', akron: 'est', toledo: 'est',
  dayton: 'est', 'grand rapids': 'est',
  // Mountain (DST) + Arizona (no DST, fixed -420)
  provo: 'mst', ogden: 'mst', 'fort collins': 'mst', pueblo: 'mst',
  chandler: -420, gilbert: -420, surprise: -420, yuma: -420, flagstaff: -420,
};

// Longest city names first so "new york city" wins over "new york", etc.
const CITY_ENTRIES = Object.entries(CITY_TO_TZ).sort(
  (a, b) => b[0].length - a[0].length,
);

/**
 * Resolve a UTC offset (minutes) from a city name mentioned in free text, e.g.
 * "houston", "i'm in chicago", "from NYC". Returns null if no known city is
 * found. Word-boundary matched so short names ("la", "sf", "dc") only hit when
 * standalone. Intended for the onboarding "what city are you in?" answer.
 */
export function parseCityOffset(text: string, now: Date = new Date()): number | null {
  const t = text.toLowerCase();
  for (const [city, tz] of CITY_ENTRIES) {
    if (new RegExp(`\\b${city}\\b`).test(t)) {
      return typeof tz === 'number' ? tz : resolveNamedOffset(tz, now);
    }
  }
  return null;
}

/**
 * Return the known city name matched in free text (Title Case), or null. Pairs
 * with parseCityOffset so we can persist the city the user actually named
 * (intake_data.city) for the coaching prompt, not just its derived offset.
 */
export function parseCity(text: string): string | null {
  const t = text.toLowerCase();
  for (const [city] of CITY_ENTRIES) {
    if (new RegExp(`\\b${city}\\b`).test(t)) {
      return city.replace(/\b\w/g, (c) => c.toUpperCase());
    }
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
