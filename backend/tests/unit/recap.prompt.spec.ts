import {
  buildNightRecapMessage,
  NightRecapData,
  buildWeeklyReviewMessage,
} from '../../src/ai/prompts/recap.prompt';

describe('buildWeeklyReviewMessage', () => {
  it('returns null when there was no activity all week', () => {
    expect(buildWeeklyReviewMessage({
      userName: 'Alex', doneCount: 0, missedCount: 0, proofCount: 0, score: null,
    })).toBeNull();
  });

  it('renders the week summary with counts and score', () => {
    const msg = buildWeeklyReviewMessage({
      userName: 'Alex', doneCount: 6, missedCount: 1, proofCount: 5, score: 72,
    })!;
    expect(msg).toMatch(/week in review/i);
    expect(msg).toContain('✅ 6 done');
    expect(msg).toContain('❌ 1 missed');
    expect(msg).toContain('📸 5 proofs');
    expect(msg).toContain('score: 72/100');
  });

  it('surfaces a recurring excuse as the biggest leak', () => {
    const msg = buildWeeklyReviewMessage({
      userName: 'Alex', doneCount: 4, missedCount: 3, proofCount: 2, score: 60,
      excusePhrase: 'too tired', excuseCount: 3,
    })!;
    expect(msg.toLowerCase()).toContain('biggest leak');
    expect(msg).toContain('too tired');
  });

  it('uses an encouraging close on a strong week', () => {
    const msg = buildWeeklyReviewMessage({
      userName: 'Alex', doneCount: 9, missedCount: 1, proofCount: 8, score: 88,
    })!;
    expect(msg.toLowerCase()).toMatch(/strong week/);
  });

  it('calls out a no-show week', () => {
    const msg = buildWeeklyReviewMessage({
      userName: 'Alex', doneCount: 0, missedCount: 5, proofCount: 0, score: 20,
    })!;
    expect(msg.toLowerCase()).toMatch(/didn'?t really show up/);
  });
});

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
