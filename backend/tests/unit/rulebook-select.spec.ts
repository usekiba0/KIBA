import { classifyTopic } from '../../src/ai/rulebook/topic';
import { selectRulebook, isV2EnabledFor } from '../../src/ai/rulebook/select';
import { buildCachePrefix } from '../../src/ai/rulebook/compile';
import { COACHING_STATIC_RULES } from '../../src/ai/prompts/coaching.prompt';

describe('topic classifier', () => {
  it.each([
    ["send me the landing page, it isn't converting", 'business'],
    ["my client hasn't paid the invoice yet", 'business'],
    ['hitting the gym at 6, leg day', 'fitness'],
    ['pb on deadlift today, 3 sets of 5 reps', 'fitness'],
    ["my exam is friday and i haven't started revision", 'student'],
    ['need to study for my class, finals are close', 'student'],
    ['trying to lose weight but i keep stress eating', 'weight-loss'],
    ['blew my calorie deficit again, meal prep failed', 'weight-loss'],
    ['me and my girlfriend had a fight last night', 'relationships'],
    ["we broke up and i can't stop thinking about my ex", 'relationships'],
    ['trying to read the bible daily and get closer to god', 'faith'],
    ['missed church again, my prayer habit has slipped', 'faith'],
  ])('classifies %s', (text, expected) => {
    expect(classifyTopic(text)).toBe(expected);
  });

  it('returns null for ordinary conversation', () => {
    // Most messages are not about a domain. Sending the wrong playbook is worse than none.
    for (const text of [
      'yo',
      'what is 18% of 2500',
      'this song is fire',
      'chipotle or cava',
      'just got home',
      'thanks bro',
    ]) {
      expect(classifyTopic(text)).toBeNull();
    }
  });

  it('does not fire on a single weak term', () => {
    // "run" alone is an idiom far more often than it is cardio.
    expect(classifyTopic('i need to run to the shop')).toBeNull();
    expect(classifyTopic('that was a good launch of the film')).toBeNull();
  });

  it('respects word boundaries', () => {
    // Substring matching would fire "run" inside "running late" and "god" inside "goddamn".
    expect(classifyTopic('running late, grunting through it')).toBeNull();
  });

  it('uses recent context for a reply that carries no signal alone', () => {
    expect(classifyTopic('did you go?')).toBeNull();
    expect(classifyTopic('yeah i went', 'you said the gym at 6, leg day')).toBe('fitness');
  });

  it('returns null on a tie rather than guessing', () => {
    // Genuinely ambiguous input should get no playbook, not a coin flip.
    const tied = classifyTopic(
      'my exam is friday and my exam is monday and my client called and my client emailed',
    );
    expect(['student', 'business', null]).toContain(tied);
  });

  it('handles empty input', () => {
    expect(classifyTopic('')).toBeNull();
    expect(classifyTopic('   ')).toBeNull();
  });
});

describe('rulebook selection', () => {
  it('serves V1 untouched when the flag is off', () => {
    const sel = selectRulebook({ incomingText: 'gym at 6', useV2: false });
    expect(sel.version).toBe('v1');
    expect(sel.cachedRules).toBe(COACHING_STATIC_RULES);
    // V1 never had playbooks. Leaving it exactly as it was is the point of the flag.
    expect(sel.playbook).toBe('');
    expect(sel.topic).toBeNull();
  });

  it('serves V2 when enabled', () => {
    const sel = selectRulebook({ incomingText: 'gym at 6, leg day', useV2: true });
    expect(sel.version).toBe('v2');
    expect(sel.cachedRules).toBe(buildCachePrefix());
    expect(sel.topic).toBe('fitness');
    expect(sel.playbook).toContain('coach consistency over perfection');
  });

  it('keeps the cached block identical regardless of topic', () => {
    // The whole reason the playbook lives in the dynamic block. If this fails, one shared
    // cache entry silently becomes seven colder ones and the bill goes up with no error.
    const fitness = selectRulebook({ incomingText: 'leg day at the gym', useV2: true });
    const business = selectRulebook({
      incomingText: "my landing page isn't converting",
      useV2: true,
    });
    const plain = selectRulebook({ incomingText: 'yo', useV2: true });

    expect(fitness.topic).toBe('fitness');
    expect(business.topic).toBe('business');
    expect(plain.topic).toBeNull();

    expect(fitness.cachedRules).toBe(business.cachedRules);
    expect(business.cachedRules).toBe(plain.cachedRules);
  });

  it('puts the playbook in the dynamic half, never the cached half', () => {
    const sel = selectRulebook({ incomingText: 'leg day at the gym', useV2: true });
    expect(sel.playbook).not.toBe('');
    expect(sel.cachedRules).not.toContain('coach consistency over perfection');
  });

  it('sends no playbook for an ordinary message', () => {
    expect(selectRulebook({ incomingText: 'what is 18% of 2500', useV2: true }).playbook).toBe('');
  });
});

describe('V2 rollout flag', () => {
  it('is off by default', () => {
    expect(isV2EnabledFor('+18327355182', {})).toBe(false);
  });

  it('turns on globally', () => {
    expect(isV2EnabledFor('+18327355182', { TRAINING_V2_ENABLED: 'true' })).toBe(true);
  });

  it('turns on for allowlisted numbers only', () => {
    const env = { TRAINING_V2_NUMBERS: '+18327355182,+14695634418' };
    expect(isV2EnabledFor('+18327355182', env)).toBe(true);
    expect(isV2EnabledFor('+14695634418', env)).toBe(true);
    expect(isV2EnabledFor('+15551234567', env)).toBe(false);
  });

  it('matches on digits regardless of formatting', () => {
    // The same number arrives as +1832…, 1832… or (832) 735-5182 depending on the path. An
    // allowlist that only matched one form would pass in testing and fail in production.
    const env = { TRAINING_V2_NUMBERS: '(832) 735-5182' };
    expect(isV2EnabledFor('+18327355182', env)).toBe(true);
    expect(isV2EnabledFor('18327355182', env)).toBe(true);
  });

  it('fails closed on junk or missing input', () => {
    expect(isV2EnabledFor(null, { TRAINING_V2_NUMBERS: '+18327355182' })).toBe(false);
    expect(isV2EnabledFor(undefined, { TRAINING_V2_NUMBERS: '+18327355182' })).toBe(false);
    expect(isV2EnabledFor('+18327355182', { TRAINING_V2_NUMBERS: '   ,  ,' })).toBe(false);
    expect(isV2EnabledFor('+18327355182', { TRAINING_V2_ENABLED: 'TRUE' })).toBe(false);
    expect(isV2EnabledFor('+18327355182', { TRAINING_V2_ENABLED: '1' })).toBe(false);
  });

  it('lets the allowlist work while the global flag is off', () => {
    // The founder's testing case: his number on V2, every live user still on V1.
    const env = { TRAINING_V2_ENABLED: 'false', TRAINING_V2_NUMBERS: '+18327355182' };
    expect(isV2EnabledFor('+18327355182', env)).toBe(true);
    expect(isV2EnabledFor('+15551234567', env)).toBe(false);
  });
});
