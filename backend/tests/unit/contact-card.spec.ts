import { buildVcard } from '../../src/onboarding/contact-card';

describe('buildVcard', () => {
  const base = {
    name: 'KIBA',
    numbers: ['+14695634418', '+18327355182'],
    url: 'https://usekiba.ai',
  };

  it('produces a valid vCard 3.0 envelope with the brand name', () => {
    const v = buildVcard(base);
    expect(v.startsWith('BEGIN:VCARD')).toBe(true);
    expect(v.trimEnd().endsWith('END:VCARD')).toBe(true);
    expect(v).toContain('VERSION:3.0');
    expect(v).toContain('FN:KIBA');
    expect(v).toContain('ORG:KIBA');
  });

  it('includes every number so the contact matches whichever channel texts', () => {
    const v = buildVcard(base);
    expect(v).toContain('TEL;TYPE=CELL,VOICE:+14695634418');
    expect(v).toContain('TEL;TYPE=CELL,VOICE:+18327355182');
    expect(v).toContain('URL:https://usekiba.ai');
  });

  it('embeds a base64 photo when provided', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const v = buildVcard({ ...base, photoPngBase64: png.toString('base64') });
    expect(v).toContain(`PHOTO;ENCODING=b;TYPE=PNG:${png.toString('base64')}`);
  });

  it('omits the photo line entirely when no photo is given', () => {
    const v = buildVcard(base);
    expect(v).not.toContain('PHOTO');
  });

  it('uses CRLF line endings (required by the vCard spec / iOS parser)', () => {
    const v = buildVcard(base);
    expect(v).toContain('BEGIN:VCARD\r\n');
    expect(v.split('\r\n').length).toBeGreaterThan(5);
  });
});
