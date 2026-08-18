import { isLatencyEchoNumber } from '../../src/messaging/messaging.controller';

/**
 * The echo replies "echo" instead of coaching, so the ONLY thing standing between a
 * debugging tool and a paying user is this gate. Every test here is about it failing
 * closed — the happy path is one line and the guards are the rest.
 */
describe('isLatencyEchoNumber', () => {
  const ME = '+18325604035';

  it('echoes a number that is explicitly listed', () => {
    expect(isLatencyEchoNumber(ME, ME)).toBe(true);
  });

  it('echoes one number out of a list', () => {
    expect(isLatencyEchoNumber(`+15550001111,${ME},+15550002222`, ME)).toBe(true);
  });

  it('tolerates spaces around entries', () => {
    expect(isLatencyEchoNumber(` +15550001111 , ${ME} `, ME)).toBe(true);
  });

  describe('fails closed', () => {
    it('when the variable is unset', () => {
      expect(isLatencyEchoNumber(undefined, ME)).toBe(false);
    });

    it('when the variable is null', () => {
      expect(isLatencyEchoNumber(null, ME)).toBe(false);
    });

    it('when the variable is empty', () => {
      expect(isLatencyEchoNumber('', ME)).toBe(false);
    });

    it('when the variable is only whitespace', () => {
      expect(isLatencyEchoNumber('   ', ME)).toBe(false);
    });

    it('when the variable is only separators — a half-cleared list must not match', () => {
      expect(isLatencyEchoNumber(',,, ,', ME)).toBe(false);
    });

    it('for a number that is not on the list', () => {
      expect(isLatencyEchoNumber('+15550001111', ME)).toBe(false);
    });

    it('on a partial match — a suffix must never be treated as membership', () => {
      // '+18325604035' contains '5604035'. Substring logic here would echo at a
      // stranger; membership is exact-match only.
      expect(isLatencyEchoNumber(ME, '5604035')).toBe(false);
      expect(isLatencyEchoNumber('+1832560403', ME)).toBe(false);
    });

    it('when the inbound number is empty', () => {
      expect(isLatencyEchoNumber(ME, '')).toBe(false);
    });
  });
});
