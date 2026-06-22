/**
 * Deterministic "what time is it in <place>" answers.
 *
 * Sibling to local-time.ts (which answers the user's OWN local time). The model
 * cannot be trusted to compute the time in another city/country — it confidently
 * gives wrong answers ("it's 3:31pm in germany" when it's 5:03pm). So we detect
 * the question, map the place to an IANA timezone, and let the runtime's tz
 * database (Intl, DST-aware) compute the real current time.
 *
 * Coverage is a curated set of common countries + major cities. An unrecognised
 * place returns null and the caller falls back to the model / asks.
 */

interface Zone {
  keys: string[];
  zone: string; // IANA timezone
  label: string; // how we say it back, e.g. "Germany", "New York", "the UK"
}

const ZONES: Zone[] = [
  // --- Countries ---
  { keys: ['germany', 'deutschland'], zone: 'Europe/Berlin', label: 'Germany' },
  { keys: ['france'], zone: 'Europe/Paris', label: 'France' },
  { keys: ['uk', 'united kingdom', 'britain', 'great britain', 'england'], zone: 'Europe/London', label: 'the UK' },
  { keys: ['ireland'], zone: 'Europe/Dublin', label: 'Ireland' },
  { keys: ['spain'], zone: 'Europe/Madrid', label: 'Spain' },
  { keys: ['italy'], zone: 'Europe/Rome', label: 'Italy' },
  { keys: ['netherlands', 'holland'], zone: 'Europe/Amsterdam', label: 'the Netherlands' },
  { keys: ['portugal'], zone: 'Europe/Lisbon', label: 'Portugal' },
  { keys: ['switzerland'], zone: 'Europe/Zurich', label: 'Switzerland' },
  { keys: ['sweden'], zone: 'Europe/Stockholm', label: 'Sweden' },
  { keys: ['norway'], zone: 'Europe/Oslo', label: 'Norway' },
  { keys: ['poland'], zone: 'Europe/Warsaw', label: 'Poland' },
  { keys: ['greece'], zone: 'Europe/Athens', label: 'Greece' },
  { keys: ['turkey', 'türkiye'], zone: 'Europe/Istanbul', label: 'Turkey' },
  { keys: ['russia'], zone: 'Europe/Moscow', label: 'Moscow' },
  { keys: ['pakistan'], zone: 'Asia/Karachi', label: 'Pakistan' },
  { keys: ['india'], zone: 'Asia/Kolkata', label: 'India' },
  { keys: ['bangladesh'], zone: 'Asia/Dhaka', label: 'Bangladesh' },
  { keys: ['china'], zone: 'Asia/Shanghai', label: 'China' },
  { keys: ['japan'], zone: 'Asia/Tokyo', label: 'Japan' },
  { keys: ['south korea', 'korea'], zone: 'Asia/Seoul', label: 'South Korea' },
  { keys: ['singapore'], zone: 'Asia/Singapore', label: 'Singapore' },
  { keys: ['philippines'], zone: 'Asia/Manila', label: 'the Philippines' },
  { keys: ['indonesia'], zone: 'Asia/Jakarta', label: 'Indonesia' },
  { keys: ['thailand'], zone: 'Asia/Bangkok', label: 'Thailand' },
  { keys: ['vietnam'], zone: 'Asia/Ho_Chi_Minh', label: 'Vietnam' },
  { keys: ['uae', 'united arab emirates', 'emirates'], zone: 'Asia/Dubai', label: 'the UAE' },
  { keys: ['saudi arabia', 'saudi'], zone: 'Asia/Riyadh', label: 'Saudi Arabia' },
  { keys: ['qatar'], zone: 'Asia/Qatar', label: 'Qatar' },
  { keys: ['israel'], zone: 'Asia/Jerusalem', label: 'Israel' },
  { keys: ['egypt'], zone: 'Africa/Cairo', label: 'Egypt' },
  { keys: ['south africa'], zone: 'Africa/Johannesburg', label: 'South Africa' },
  { keys: ['nigeria'], zone: 'Africa/Lagos', label: 'Nigeria' },
  { keys: ['kenya'], zone: 'Africa/Nairobi', label: 'Kenya' },
  { keys: ['australia'], zone: 'Australia/Sydney', label: 'Australia (Sydney)' },
  { keys: ['new zealand'], zone: 'Pacific/Auckland', label: 'New Zealand' },
  { keys: ['canada'], zone: 'America/Toronto', label: 'Canada (Toronto)' },
  { keys: ['mexico'], zone: 'America/Mexico_City', label: 'Mexico' },
  { keys: ['brazil'], zone: 'America/Sao_Paulo', label: 'Brazil' },
  { keys: ['argentina'], zone: 'America/Argentina/Buenos_Aires', label: 'Argentina' },
  { keys: ['usa', 'us', 'u.s.', 'united states', 'america'], zone: 'America/New_York', label: 'the US (Eastern)' },
  // --- US cities ---
  { keys: ['new york', 'nyc', 'new york city'], zone: 'America/New_York', label: 'New York' },
  { keys: ['los angeles', 'la', 'l.a.'], zone: 'America/Los_Angeles', label: 'Los Angeles' },
  { keys: ['san francisco', 'sf'], zone: 'America/Los_Angeles', label: 'San Francisco' },
  { keys: ['seattle'], zone: 'America/Los_Angeles', label: 'Seattle' },
  { keys: ['las vegas', 'vegas'], zone: 'America/Los_Angeles', label: 'Las Vegas' },
  { keys: ['chicago'], zone: 'America/Chicago', label: 'Chicago' },
  { keys: ['houston'], zone: 'America/Chicago', label: 'Houston' },
  { keys: ['dallas'], zone: 'America/Chicago', label: 'Dallas' },
  { keys: ['austin'], zone: 'America/Chicago', label: 'Austin' },
  { keys: ['denver'], zone: 'America/Denver', label: 'Denver' },
  { keys: ['phoenix'], zone: 'America/Phoenix', label: 'Phoenix' },
  { keys: ['miami'], zone: 'America/New_York', label: 'Miami' },
  { keys: ['boston'], zone: 'America/New_York', label: 'Boston' },
  { keys: ['atlanta'], zone: 'America/New_York', label: 'Atlanta' },
  { keys: ['washington', 'dc', 'washington dc'], zone: 'America/New_York', label: 'Washington DC' },
  // --- World cities ---
  { keys: ['london'], zone: 'Europe/London', label: 'London' },
  { keys: ['paris'], zone: 'Europe/Paris', label: 'Paris' },
  { keys: ['berlin'], zone: 'Europe/Berlin', label: 'Berlin' },
  { keys: ['madrid'], zone: 'Europe/Madrid', label: 'Madrid' },
  { keys: ['rome'], zone: 'Europe/Rome', label: 'Rome' },
  { keys: ['amsterdam'], zone: 'Europe/Amsterdam', label: 'Amsterdam' },
  { keys: ['moscow'], zone: 'Europe/Moscow', label: 'Moscow' },
  { keys: ['istanbul'], zone: 'Europe/Istanbul', label: 'Istanbul' },
  { keys: ['dubai'], zone: 'Asia/Dubai', label: 'Dubai' },
  { keys: ['abu dhabi'], zone: 'Asia/Dubai', label: 'Abu Dhabi' },
  { keys: ['karachi'], zone: 'Asia/Karachi', label: 'Karachi' },
  { keys: ['lahore'], zone: 'Asia/Karachi', label: 'Lahore' },
  { keys: ['islamabad'], zone: 'Asia/Karachi', label: 'Islamabad' },
  { keys: ['mumbai', 'bombay'], zone: 'Asia/Kolkata', label: 'Mumbai' },
  { keys: ['delhi', 'new delhi'], zone: 'Asia/Kolkata', label: 'Delhi' },
  { keys: ['bangalore', 'bengaluru'], zone: 'Asia/Kolkata', label: 'Bangalore' },
  { keys: ['tokyo'], zone: 'Asia/Tokyo', label: 'Tokyo' },
  { keys: ['seoul'], zone: 'Asia/Seoul', label: 'Seoul' },
  { keys: ['beijing'], zone: 'Asia/Shanghai', label: 'Beijing' },
  { keys: ['shanghai'], zone: 'Asia/Shanghai', label: 'Shanghai' },
  { keys: ['hong kong'], zone: 'Asia/Hong_Kong', label: 'Hong Kong' },
  { keys: ['sydney'], zone: 'Australia/Sydney', label: 'Sydney' },
  { keys: ['melbourne'], zone: 'Australia/Melbourne', label: 'Melbourne' },
  { keys: ['toronto'], zone: 'America/Toronto', label: 'Toronto' },
  { keys: ['vancouver'], zone: 'America/Vancouver', label: 'Vancouver' },
  { keys: ['cairo'], zone: 'Africa/Cairo', label: 'Cairo' },
  { keys: ['lagos'], zone: 'Africa/Lagos', label: 'Lagos' },
  { keys: ['nairobi'], zone: 'Africa/Nairobi', label: 'Nairobi' },
  { keys: ['johannesburg'], zone: 'Africa/Johannesburg', label: 'Johannesburg' },
];

const LOOKUP: Map<string, Zone> = (() => {
  const m = new Map<string, Zone>();
  for (const z of ZONES) {
    for (const k of z.keys) {
      m.set(k, z);
      // Also index the space-stripped form so "newyork", "losangeles",
      // "hongkong", "abudhabi" etc. resolve the same as the spaced spelling.
      const despaced = k.replace(/\s/g, '');
      if (despaced !== k) m.set(despaced, z);
    }
  }
  return m;
})();

// Form A — "what time is it in <place>", "time in <place>", "whats the time in
// <place>". Captures everything after "in"/"at"/"for".
const TIME_IN_PLACE_RE = new RegExp(
  '^\\s*(?:hey|yo|ok|okay|so|um|hmm|bro|aye|ayo)?[\\s,]*' +
    '(?:can you tell me|could you tell me|do you know|u know|you know|tell me)?\\s*' +
    '(?:' +
      'what\\s+time\\s+is\\s+it' +
      '|what(?:\'?s| is)?\\s+the\\s+time' +
      '|what\\s+time' +
      '|current\\s+time' +
      '|time' +
    ')\\s+(?:in|at|over\\s+in|for)\\s+(.+?)\\s*[?.!]*$',
  'i',
);

// Form B — "<place> time", "<place> time now", "newyork time rn". The place is
// at the FRONT. A bogus place (e.g. "what" from "what time") just fails the
// lookup and falls through, so this is safe to be permissive.
const PLACE_TIME_RE = new RegExp(
  '^\\s*(?:hey|yo|ok|okay|so|um|hmm|bro|aye|ayo)?[\\s,]*' +
    '(.+?)\\s+time(?:\\s+(?:now|right\\s+now|rn|currently|today|atm))?\\s*[?.!]*$',
  'i',
);

const TRAILING_NOISE = /\b(right now|now|rn|currently|today|atm|at the moment|please|pls)\b/g;

function normalizePlace(raw: string): string | null {
  const place = raw
    .toLowerCase()
    .replace(/[^a-z\s.]/g, ' ')
    .replace(TRAILING_NOISE, ' ')
    .replace(/\bthe\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return place || null;
}

/**
 * If the message asks the time in a place — "what time is it in <place>" OR
 * "<place> time now" — return the place string (normalised). Else null.
 */
export function parseTimeInPlace(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  const a = TIME_IN_PLACE_RE.exec(trimmed);
  if (a) return normalizePlace(a[1]);
  const b = PLACE_TIME_RE.exec(trimmed);
  if (b) return normalizePlace(b[1]);
  return null;
}

/** Resolve a place name to its IANA zone + display label, or null if unknown. */
export function resolvePlaceTimezone(place: string | null | undefined): { zone: string; label: string } | null {
  if (!place) return null;
  const key = place.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
  const z = LOOKUP.get(key);
  return z ? { zone: z.zone, label: z.label } : null;
}

/** Current wall-clock in an IANA zone as "5:03pm" (DST-aware via Intl). null on bad zone. */
export function formatTimeInZone(nowUtc: Date, zone: string): string | null {
  try {
    const s = nowUtc.toLocaleTimeString('en-US', {
      timeZone: zone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    // "5:03 PM" -> "5:03pm"
    return s.replace(/\s/g, '').toLowerCase();
  } catch {
    return null;
  }
}
