export const HIGH_RISK_KEYWORDS: string[] = [
  'kill myself',
  'want to die',
  'end my life',
  'suicide',
  'suicidal',
  'hurt myself',
  'hurting myself',
  'self harm',
  'self-harm',
  "can't go on",
  'cannot go on',
  'no reason to live',
  'better off dead',
  'want to end it',
  'ending it all',
  'taking my life',
];

export function containsHighRiskKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return HIGH_RISK_KEYWORDS.some((kw) => lower.includes(kw));
}
