import { buildNightRecapMessage, NightRecapData } from '../../src/ai/prompts/recap.prompt';

const base: NightRecapData = {
  userName: 'Alex',
  done: [],
  missed: [],
  proofCount: 0,
  score: null,
};

describe('buildNightRecapMessage', () => {
  it('returns null when nothing was on the board today', () => {
    expect(buildNightRecapMessage(base)).toBeNull();
  });

  it('renders a recap header, the done/missed lists and the score', () => {
    const msg = buildNightRecapMessage({
      ...base,
      done: ['leg workout'],
      missed: ['business deep work'],
      proofCount: 2,
      score: 72,
    });
    expect(msg).toContain('day recap:');
    expect(msg).toContain('✅ leg workout');
    expect(msg).toContain('❌ business deep work');
    expect(msg).toContain('proof sent: 2');
    expect(msg).toContain('score: 72/100');
  });

  it('omits the proof line when no proof was sent and the score line when null', () => {
    const msg = buildNightRecapMessage({ ...base, done: ['gym'], score: null, proofCount: 0 })!;
    expect(msg).not.toContain('proof sent');
    expect(msg).not.toContain('score:');
  });

  it('celebrates a clean day (nothing missed)', () => {
    const msg = buildNightRecapMessage({ ...base, done: ['gym', 'deep work'], score: 95 })!;
    expect(msg).not.toContain('❌');
    expect(msg.toLowerCase()).toMatch(/clean day|locked-in/);
  });

  it('calls out a fold when everything was dropped', () => {
    const msg = buildNightRecapMessage({ ...base, missed: ['gym'], score: 10 })!;
    expect(msg.toLowerCase()).toContain('folded');
    expect(msg).toContain('gym');
  });

  it('escalates on a repeated excuse instead of the normal verdict', () => {
    const msg = buildNightRecapMessage({
      ...base,
      done: ['gym'],
      missed: ['deep work'],
      excusePhrase: 'too tired',
      excuseCount: 3,
    })!;
    expect(msg).toContain('too tired');
    expect(msg).toContain('3');
  });

  it('caps each list and shows a "+N more" overflow', () => {
    const msg = buildNightRecapMessage({
      ...base,
      done: ['a', 'b', 'c', 'd', 'e', 'f'],
      score: 50,
    })!;
    expect(msg).toContain('+2 more');
  });
});
