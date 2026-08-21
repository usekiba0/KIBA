import {
  claimsSpecificRecall,
  stripFalseMemoryClaims,
} from '../../src/ai/memory-claim-guard';
import {
  detectWeaponisedMemory,
  SENSITIVE_MEMORY_RETRY_NOTE,
} from '../../src/ai/sensitive-memory-guard';

describe('memory claim guard (INV-2)', () => {
  const context = 'goal: send 30 cold emails a day. gym at 6pm on tuesday. weight target 180.';

  describe('what counts as a specific claim', () => {
    it('flags attributed recall carrying a concrete detail', () => {
      expect(claimsSpecificRecall('you said 30 emails a day')).toBe(true);
      expect(claimsSpecificRecall('last week you told me tuesday worked better')).toBe(true);
    });

    it('does not flag vague recall', () => {
      // Explicitly allowed by the doctrine: "i remember we were working on retention" is fine.
      expect(claimsSpecificRecall('i remember we were working on retention')).toBe(false);
      expect(claimsSpecificRecall('you said you wanted this')).toBe(false);
    });

    it('does not flag a sentence with no attribution', () => {
      expect(claimsSpecificRecall('30 emails is a lot')).toBe(false);
    });
  });

  describe('stripping unsupported claims', () => {
    it('keeps a claim whose details are in context', () => {
      const r = stripFalseMemoryClaims('you said 30 emails a day. still the plan?', context);
      expect(r.stripped).toEqual([]);
      expect(r.reply).toContain('30 emails');
    });

    it('strips a claim whose details are not in context', () => {
      // The failure the client called out: a confident number KIBA never had.
      const r = stripFalseMemoryClaims(
        'nice one. you said you would send 75 emails by thursday.',
        context,
      );
      expect(r.stripped).toHaveLength(1);
      expect(r.reply).toBe('nice one.');
    });

    it('leaves vague recall alone even when nothing supports it', () => {
      const r = stripFalseMemoryClaims('i remember you saying it was rough', context);
      expect(r.stripped).toEqual([]);
    });

    it('keeps non-recall sentences untouched', () => {
      const r = stripFalseMemoryClaims('what are you hitting today?', context);
      expect(r.reply).toBe('what are you hitting today?');
    });

    it('never empties the reply', () => {
      // A guard that silences KIBA is worse than the claim it removes. The 2026-07-29 recap bug
      // was exactly this: a fix for saying something false became saying nothing at all, and
      // silence never shows up in logs.
      const only = 'you said 99 emails by saturday.';
      const r = stripFalseMemoryClaims(only, context);
      expect(r.reply).toBe(only);
      expect(r.stripped).toEqual([]);
    });

    it('handles an empty reply', () => {
      expect(stripFalseMemoryClaims('', context).reply).toBe('');
    });

    it('does not punish asking instead of asserting', () => {
      // Asking IS the correct behaviour when confidence is low. Flagging it would penalise the
      // exact fix the doctrine asks for.
      const r = stripFalseMemoryClaims('was it 30 emails or 50? remind me', context);
      expect(r.stripped).toEqual([]);
    });
  });
});

describe('sensitive memory guard (INV-6)', () => {
  it('allows sensitive topics in a supportive frame', () => {
    // KIBA should absolutely talk about these things. Blocking the topic outright would break
    // "be present during difficult moments", which matters just as much.
    for (const reply of [
      'how are you doing after the funeral?',
      "i'm sorry about the breakup. want to talk about it or just sit with it?",
      'therapy is a good call honestly',
      'money being tight is real. what does the month actually look like?',
    ]) {
      expect(detectWeaponisedMemory(reply).weaponised).toBe(false);
    }
  });

  it('catches ridicule built on something painful', () => {
    const r = detectWeaponisedMemory("lol remember when you relapsed? don't do that again");
    expect(r.weaponised).toBe(true);
    expect(r.offending).toHaveLength(1);
  });

  it('catches pressure built on something painful', () => {
    expect(
      detectWeaponisedMemory('this is why you got laid off. sort it out').weaponised,
    ).toBe(true);
    expect(
      detectWeaponisedMemory("keep this up and you'll end up like after the divorce").weaponised,
    ).toBe(true);
  });

  it('catches a vulnerability used to close a sale', () => {
    // Named separately in Legacy §23 and Stress Test §44, and it is the version most likely to
    // be written on purpose rather than by accident.
    expect(
      detectWeaponisedMemory("you'll relapse without me. upgrade to pro").weaponised,
    ).toBe(true);
    expect(
      detectWeaponisedMemory('if you really cared about your depression you would subscribe')
        .weaponised,
    ).toBe(true);
  });

  it('allows hard accountability that attacks behaviour', () => {
    // The doctrine wants this. The line is worth vs behaviour, not intensity.
    for (const reply of [
      "bro you said 6am and it's 9. what happened",
      'that is the third miss this week. the setup is wrong, not you',
      'stop bullshitting me and open the laptop',
    ]) {
      expect(detectWeaponisedMemory(reply).weaponised).toBe(false);
    }
  });

  it('returns the offending sentences for logging', () => {
    const r = detectWeaponisedMemory(
      "good work today. lol remember when you were bankrupt? anyway what's next",
    );
    expect(r.offending[0]).toContain('bankrupt');
    expect(r.offending).toHaveLength(1);
  });

  it('offers a retry steer that names the rule, not the sentence', () => {
    // Telling a model "don't say X" tends to produce a paraphrase of X.
    expect(SENSITIVE_MEMORY_RETRY_NOTE).toContain('never their worth');
    expect(SENSITIVE_MEMORY_RETRY_NOTE.length).toBeLessThan(400);
  });

  it('handles empty input', () => {
    expect(detectWeaponisedMemory('').weaponised).toBe(false);
  });
});
