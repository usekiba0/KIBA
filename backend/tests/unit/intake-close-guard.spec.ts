import {
  stripIdentityReferendum,
  hasTrailingIdentityReferendum,
} from '../../src/messaging/intake-close-guard';

describe('stripIdentityReferendum', () => {
  describe('the four instances Training Doc v2 caught across two graded tests', () => {
    const LIVE_FAILURES = [
      'you really ready to cut the weekend drinking, or are you still testing it out?',
      'you wanna lock this in or nah?',
      'you ready to lock that in?',
      'you down to actually do it for real, or you still thinking about it?',
    ];

    it.each(LIVE_FAILURES)('strips %s', (question) => {
      const msg = `alright marcus, here's the play. no drinking fri and sat. ${question}`;
      const out = stripIdentityReferendum(msg);
      expect(out).not.toContain(question);
      expect(out).toContain('no drinking fri and sat');
    });
  });

  it('strips the exact line the 2026-07-29 live sim produced', () => {
    // The prompt ban was already in place when the model sent this.
    const msg =
      "and real talk. your brother. that album's been waiting. we fix that, you finish what you promised him. you ready to lock this in?";
    const out = stripIdentityReferendum(msg);
    expect(out).not.toMatch(/ready to lock this in/i);
    // The callback — the strongest line — is what the message now ends on.
    expect(out.trim()).toMatch(/you promised him\.$/);
  });

  it('catches the "testing the waters" variant with no still/just (live sim 2026-07-29)', () => {
    const msg =
      "so three years running with the boys on weekends. that's how you've been moving through it. you actually wanna get out of that cycle, or you testing the waters?";
    const out = stripIdentityReferendum(msg);
    expect(out).not.toMatch(/testing the waters/i);
    expect(out).toContain('three years running with the boys');
  });

  it('also catches the older banned dares', () => {
    for (const q of [
      'are you serious or just interested?',
      'you gonna follow through or nah?',
      'no half measures.',
      'you sure you wanna do this?',
    ]) {
      expect(hasTrailingIdentityReferendum(`here's the plan. ${q}`)).toBe(true);
    }
  });

  describe('leaves legitimate closes alone', () => {
    const KEEP = [
      // The training doc's OWN model-answer close ends this way.
      "and real talk. your daughter's noticing already. that's what we're actually fighting for. you in?",
      // Design question — the prescribed replacement.
      'want me writing your friday script tonight, or you wanna sketch it and i clean it up?',
      // Concrete-commit question — also prescribed.
      'what time you want the check-in?',
      // A normal diagnostic beat.
      'how many nights a weekend are we talking?',
      // Plain statement, no question at all.
      "9am. locked. tonight i'm building your friday playbook.",
      // "ready" used about a THING, not about their commitment.
      'your plan will be ready tomorrow morning.',
    ];

    it.each(KEEP)('keeps: %s', (msg) => {
      expect(stripIdentityReferendum(msg)).toBe(msg);
    });
  });

  describe('mechanics', () => {
    it('only strips from the END, never mid-message', () => {
      const msg =
        "you asked me if you were ready to lock that in. wrong question. what time you want the check-in?";
      expect(stripIdentityReferendum(msg)).toBe(msg);
    });

    it('strips two stacked referendum questions', () => {
      const msg = "here's the play. you ready to lock that in? you sure you wanna do this?";
      const out = stripIdentityReferendum(msg);
      expect(out.trim()).toBe("here's the play.");
    });

    it('operates on the final [pause] bubble only', () => {
      const msg = "that's the whole thing. 3 days.[pause]you ready to lock this in?";
      expect(stripIdentityReferendum(msg)).toBe("that's the whole thing. 3 days.");
    });

    it('preserves earlier bubbles when the last one is dropped whole', () => {
      const msg = 'first beat.[pause]second beat.[pause]you wanna lock this in or nah?';
      expect(stripIdentityReferendum(msg)).toBe('first beat.[pause]second beat.');
    });

    it('is NON-DESTRUCTIVE when the message is nothing but the referendum', () => {
      // Sending a flawed message beats sending nothing — same fallback rule the
      // intake reply path already follows.
      const msg = 'you ready to lock that in?';
      expect(stripIdentityReferendum(msg)).toBe(msg);
    });

    it('handles empty and whitespace input without throwing', () => {
      expect(stripIdentityReferendum('')).toBe('');
      expect(stripIdentityReferendum('   ')).toBe('   ');
    });
  });
});
