import axios from 'axios';
import { needsTranscode, prepare, warm, _reset } from '../../src/messaging/image-prep';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const convertCalls: unknown[] = [];
jest.mock('heic-convert', () => jest.fn(async (args: unknown) => {
  convertCalls.push(args);
  // Simulate the real cost so ordering/dedup behaviour is exercised, not just shape.
  await new Promise((r) => setTimeout(r, 5));
  return Buffer.from('jpegbytes');
}));

describe('needsTranscode', () => {
  it('flags HEIC by content type and by extension', () => {
    expect(needsTranscode('https://cdn/a', 'image/heic')).toBe(true);
    expect(needsTranscode('https://cdn/a', 'image/heif')).toBe(true);
    expect(needsTranscode('https://cdn/IMG_1.HEIC')).toBe(true);
    expect(needsTranscode('https://cdn/IMG_1.heic?x=1')).toBe(true);
  });
  it('leaves formats the API already accepts alone', () => {
    expect(needsTranscode('https://cdn/a.jpg', 'image/jpeg')).toBe(false);
    expect(needsTranscode('https://cdn/a.png', 'image/png')).toBe(false);
    expect(needsTranscode('https://cdn/a', 'image/webp')).toBe(false);
  });
  it('handles a charset parameter and odd casing', () => {
    expect(needsTranscode('https://cdn/a', 'IMAGE/HEIC; charset=binary')).toBe(true);
  });
});

describe('image-prep cache', () => {
  beforeEach(() => {
    _reset();
    convertCalls.length = 0;
    jest.clearAllMocks();
    mockedAxios.get.mockResolvedValue({ data: Buffer.from('heicbytes') } as never);
  });

  it('transcodes and returns base64', async () => {
    const r = await prepare('https://cdn/a.heic');
    expect(r).toEqual({ ok: true, base64: Buffer.from('jpegbytes').toString('base64') });
  });

  // The whole point: the debouncer starts the work, the turn consumes it.
  it('reuses warm() work instead of converting the same photo twice', async () => {
    warm('https://cdn/a.heic', 'image/heic');
    const r = await prepare('https://cdn/a.heic');

    expect(r.ok).toBe(true);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(convertCalls).toHaveLength(1);
  });

  it('dedupes concurrent consumers of an IN-FLIGHT conversion', async () => {
    const [a, b, c] = await Promise.all([
      prepare('https://cdn/x.heic'),
      prepare('https://cdn/x.heic'),
      prepare('https://cdn/x.heic'),
    ]);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(convertCalls).toHaveLength(1);
  });

  it('warm() is a no-op for formats that need no transcode', () => {
    warm('https://cdn/a.jpg', 'image/jpeg');
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('never throws out of warm() when the fetch fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('cdn down'));
    expect(() => warm('https://cdn/bad.heic', 'image/heic')).not.toThrow();
    // And the consumer gets a clean failure value rather than a rejection.
    await expect(prepare('https://cdn/bad.heic')).resolves.toMatchObject({ ok: false });
  });

  it('reports a failure instead of rejecting, so a bad photo cannot kill the turn', async () => {
    mockedAxios.get.mockRejectedValue(new Error('boom'));
    const r = await prepare('https://cdn/err.heic');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('boom');
  });

  it('retries a previously failed photo rather than caching the failure forever', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('transient'));
    const first = await prepare('https://cdn/flaky.heic');
    expect(first.ok).toBe(false);

    mockedAxios.get.mockResolvedValue({ data: Buffer.from('heicbytes') } as never);
    const second = await prepare('https://cdn/flaky.heic');
    expect(second.ok).toBe(true);
  });

  it('bounds memory — a long photo dump cannot pin every JPEG in the cache', async () => {
    // 12 distinct photos through a cache capped at 8.
    for (let i = 0; i < 12; i++) await prepare(`https://cdn/${i}.heic`);
    const before = convertCalls.length;
    // The oldest must have been evicted, so re-preparing it does real work again.
    await prepare('https://cdn/0.heic');
    expect(convertCalls.length).toBe(before + 1);
  });
});
