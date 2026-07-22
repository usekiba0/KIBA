/**
 * KIBA contact-card (vCard) builder — Apple-masking Path B.
 *
 * Apple has NO native branding for a business that texts a user FIRST
 * (Business Caller ID is calls-only; Messages-for-Business is inbound-only).
 * The ONLY way outbound texts show "KIBA" instead of a bare number is the user
 * saving our contact card — so onboarding auto-sends this .vcf right after
 * activation. Saving it also defeats iOS "Screen Unknown Senders" filtering.
 *
 * Multiple TELs on purpose: iMessage traffic comes from the SendBlue number,
 * the Android/SMS fallback from the Twilio number — one saved contact must
 * brand BOTH threads as KIBA.
 *
 * Pure + exported for tests; scripts/gen-contact-card.js renders the real file
 * (with the logo PHOTO) into frontend/public/kiba-contact.vcf.
 */
export function buildVcard(opts: {
  name: string;
  numbers: string[];
  url?: string;
  photoPngBase64?: string;
}): string {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:;${opts.name};;;`,
    `FN:${opts.name}`,
    `ORG:${opts.name}`,
    ...opts.numbers.map((n) => `TEL;TYPE=CELL,VOICE:${n}`),
    ...(opts.url ? [`URL:${opts.url}`] : []),
    ...(opts.photoPngBase64 ? [`PHOTO;ENCODING=b;TYPE=PNG:${opts.photoPngBase64}`] : []),
    'END:VCARD',
  ];
  // CRLF is mandated by RFC 2426 and what iOS's parser expects.
  return lines.join('\r\n') + '\r\n';
}
