import { capBoardDump, MAX_BOARD_LINES } from '../../src/ai/board-dump-guard';

// The real board Bianca woke up to on 2026-07-29 — twelve auto-seeded plan items
// from two goals, none of them agreed to, all printed in one message.
const BOARD = [
  'Prep 3 dinners and freeze 2',
  'Eat one prepped dinner',
  'Measure all cooking oils and condiments today',
  'Repeat Day 5 routine exactly',
  'Notice if you have urges to snack outside the 3pm window',
  'Write down what triggered each urge',
  'Complete 25 minutes of movement',
  'Eat meals on schedule',
  'Choose one snacking trigger and plan an alternative for next week',
  'Repeat Day 5 structure',
  'Allow yourself one planned snack at a set time',
  'Practice your replacement activity twice today',
];

describe('capBoardDump', () => {
  it('cuts the wall of board items down to the cap', () => {
    const reply = ['on the board today:', ...BOARD.map((b) => `- ${b}`)].join('\n');
    const out = capBoardDump(reply, BOARD);

    expect(out.dropped).toBe(BOARD.length - MAX_BOARD_LINES);
    const bullets = out.text.split('\n').filter((l) => l.trim().startsWith('- '));
    expect(bullets).toHaveLength(MAX_BOARD_LINES);
    // The first items survive, in order, and the header is untouched.
    expect(out.text).toContain('on the board today:');
    expect(out.text).toContain('- Prep 3 dinners and freeze 2');
    expect(out.text).not.toContain('Practice your replacement activity');
  });

  it('offers the rest instead of silently truncating', () => {
    const reply = BOARD.map((b) => `- ${b}`).join('\n');
    expect(capBoardDump(reply, BOARD).text).toMatch(/want the rest/i);
  });

  it('does not add a second offer when the model already made one', () => {
    const reply = `${BOARD.map((b) => `- ${b}`).join('\n')}\n\nthat's the front of it, want the rest?`;
    const out = capBoardDump(reply, BOARD);
    expect(out.text.match(/want the rest/gi)).toHaveLength(1);
  });

  it('leaves a reply at or under the cap completely alone', () => {
    const reply = `next up:\n- ${BOARD[0]}\n- ${BOARD[1]}\nwhat time?`;
    const out = capBoardDump(reply, BOARD);
    expect(out.dropped).toBe(0);
    expect(out.text).toBe(reply);
  });

  it('never touches a bulleted list that is not the board', () => {
    // Macro breakdowns are bulleted too, and they are exactly what KIBA is FOR.
    const reply = [
      'rough macros:',
      '- cabbage (~2 cups cooked): ~60-80 cal',
      '- beef stew (~1.5 cups): ~280-340 cal',
      '- watermelon (~1.5 cups): ~70-90 cal',
      '- total: ~410-510 cal',
    ].join('\n');
    const out = capBoardDump(reply, BOARD);
    expect(out.dropped).toBe(0);
    expect(out.text).toBe(reply);
  });

  it('matches board items regardless of bullet style, case or punctuation', () => {
    const reply = BOARD.map((b, i) => `${i + 1}. ${b.toUpperCase()}.`).join('\n');
    expect(capBoardDump(reply, BOARD).dropped).toBe(BOARD.length - MAX_BOARD_LINES);
  });

  it('is a no-op when there is no board', () => {
    const reply = '- something\n- else\n- again\n- and more';
    expect(capBoardDump(reply, []).text).toBe(reply);
  });
});
