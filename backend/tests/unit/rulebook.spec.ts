import {
  RULES,
  Rule,
  Topic,
  rulesFor,
  ruleById,
  supersedingRules,
} from '../../src/ai/rulebook/rules';
import {
  buildCachePrefix,
  buildL0,
  buildL1,
  buildL2,
  buildStaticPrompt,
  compiledRuleIds,
  PROMPT_CHAR_CEILING,
} from '../../src/ai/rulebook/compile';

const TOPICS: Topic[] = ['business', 'fitness', 'student', 'weight-loss', 'relationships', 'faith'];

describe('rule catalogue integrity', () => {
  it('gives every rule a unique, stable id', () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cites a rulebook section and a source document for every rule', () => {
    // Traceability is the whole point of the catalogue: any line that reaches the model must
    // be answerable to "which of the client's 40 documents said this?".
    const untraceable = RULES.filter((r) => !r.section.startsWith('§') || r.source.trim() === '');
    expect(untraceable.map((r) => r.id)).toEqual([]);
  });

  it('writes rule text in the texting voice the rules themselves demand', () => {
    // A rule that violates the tone it is asking for teaches the model the wrong thing by
    // example, which is exactly how V1's prompt drifted from V1's doctrine.
    const offenders = RULES.filter((r) => /—|–|\*\*|^#/.test(r.text));
    expect(offenders.map((r) => r.id)).toEqual([]);
  });

  it('scopes topics to L2 rules only', () => {
    const misplaced = RULES.filter((r) => r.topic !== undefined && r.layer !== 'L2');
    expect(misplaced.map((r) => r.id)).toEqual([]);
  });

  it('covers all six playbook domains', () => {
    for (const topic of TOPICS) {
      expect(RULES.some((r) => r.layer === 'L2' && r.topic === topic)).toBe(true);
    }
  });

  it('looks up a known rule and misses an unknown one', () => {
    expect(ruleById('L1-one-word-ok')?.layer).toBe('L1');
    expect(ruleById('nope')).toBeUndefined();
  });
});

describe('cache prefix invariance', () => {
  // If this fails the Anthropic cache misses on every single turn. Nothing errors, nothing
  // logs — cost and latency just quietly regress. It is the most expensive silent failure in
  // this file, hence asserting it three different ways.
  it('is byte-identical across repeated builds', () => {
    expect(buildCachePrefix()).toBe(buildCachePrefix());
  });

  it('contains no interpolation markers left behind by a template', () => {
    expect(buildCachePrefix()).not.toMatch(/\$\{|\{\{|<name>|%s/);
  });

  it('contains nothing user-specific or time-specific', () => {
    const prefix = buildCachePrefix().toLowerCase();
    // A date or an interpolated field in here means someone put dynamic context in the static
    // layer. Note this looks for field-shaped tokens, not ordinary words: the rules legitimately
    // say "renders as junk on a phone", which an over-broad /\bphone\b/ flagged as a leak.
    expect(prefix).not.toMatch(/\b20\d{2}-\d{2}-\d{2}\b/);
    expect(prefix).not.toMatch(/\buser_id\b|\buserId\b|\bphone_number\b|\btz_offset\b/);
  });
});

describe('prompt assembly', () => {
  it('emits every L0 and L1 rule into the prefix', () => {
    const prefix = buildCachePrefix();
    for (const rule of [...rulesFor('L0'), ...rulesFor('L1')]) {
      expect(prefix).toContain(rule.text);
    }
  });

  it('sends only the active playbook, never all six', () => {
    const fitness = buildStaticPrompt('fitness');
    expect(fitness).toContain(ruleById('L2-fitness')!.text);
    expect(fitness).not.toContain(ruleById('L2-business')!.text);
    expect(fitness).not.toContain(ruleById('L2-faith')!.text);
  });

  it('ships the precedence rule with every playbook', () => {
    // Without this a playbook reads as orders and starts overriding what we know about the
    // individual (Master 26).
    for (const topic of TOPICS) {
      expect(buildL2(topic)).toContain(ruleById('L2-playbook-precedence')!.text);
    }
  });

  it('adds nothing when no topic is active', () => {
    expect(buildL2(null)).toBe('');
    expect(buildStaticPrompt(null)).toBe(buildCachePrefix());
  });

  it('stays under the prompt ceiling for every topic, leaving room for dynamic context', () => {
    // The static prompt is only part of the turn; per-user state, history and the user's own
    // message all land on top of it. Budget half the ceiling for the static half.
    for (const topic of [...TOPICS, null]) {
      expect(buildStaticPrompt(topic).length).toBeLessThan(PROMPT_CHAR_CEILING / 2);
    }
  });

  it('never leaks a price literal into the prompt', () => {
    // INV-3: Pro terms come from live product state. The stress test hardcodes $9.99 and the
    // product has charged $20; a literal in here would let KIBA quote a stale number at a
    // paying customer.
    const all = TOPICS.map((t) => buildStaticPrompt(t)).join('\n');
    expect(all).not.toMatch(/\$\s?\d/);
  });
});

describe('the nine V1 contradictions stay resolved', () => {
  // Each of these encodes a rule V1 got backwards. They exist so a well-meaning revert to the
  // old wording fails loudly rather than quietly reintroducing the behaviour the client
  // complained about.
  const prefix = buildCachePrefix();

  it('records which V1 rule each superseding rule replaces', () => {
    const superseding = supersedingRules();
    expect(superseding.length).toBeGreaterThanOrEqual(5);
    for (const rule of superseding) {
      expect(rule.supersedes).toMatch(/^C-\d/);
    }
  });

  it('C-1: imposes no word cap', () => {
    expect(prefix).not.toMatch(/under \d+ words|\d+ words max|max \d+ words/i);
    expect(prefix).toContain('there is no word limit');
  });

  it('C-2: permits a one-word reply', () => {
    expect(prefix).not.toMatch(/never a one-liner/i);
    expect(prefix).toContain('a single word is often the whole correct reply');
  });

  it('C-3: defaults to one bubble', () => {
    expect(prefix).toContain('default to one bubble');
    expect(prefix).not.toMatch(/2 bubbles is the norm/i);
  });

  it('C-4: leads friend-first, not enforcer', () => {
    expect(prefix).toContain('friend first and a coach second');
    expect(prefix).not.toMatch(/enforcer/i);
  });

  it('C-7: solves before motivating', () => {
    expect(prefix).toContain('solve before you motivate');
  });

  it('C-8: carries Value Application', () => {
    expect(prefix).toContain('offer to do the work with them');
    // And its brake — the rule is worthless, and actively annoying, without the restraint.
    expect(prefix).toContain('do not force help in');
  });
});

describe('non-negotiable rules cannot be deleted', () => {
  // The coverage report flagged that most rules were compiled but not *named* by any test.
  // That matters more than it sounds: every other assertion in this file iterates whatever the
  // catalogue happens to contain, so deleting a rule outright makes those tests pass trivially.
  // This list is the backstop. If someone removes one of these while trimming the prompt for
  // size, the build fails and names it.
  //
  // Membership rule: a rule belongs here if losing it silently would either break a trust
  // invariant (INV-1…INV-8) or reintroduce one of the nine V1 contradictions.
  const NON_NEGOTIABLE = [
    // identity and the anti-script stance
    'L0-identity',
    'L0-general-brain',
    'L0-no-script',
    'L0-solve-before-motivate',
    'L0-honest',
    // the contradictions the client actually complained about
    'L1-length-judgement',
    'L1-one-word-ok',
    'L1-simple-stays-simple',
    'L1-bubbles',
    'L1-adapt-not-copy',
    // value application, and its brake
    'L1-value-application',
    'L1-value-not-forced',
    'L1-everyday-ai',
    // trust invariants
    'L1-no-fake-actions',
    'L1-no-fake-memory',
    'L1-certainty-language',
    'L1-cant-see-it',
    'L1-high-stakes',
    // accountability safety
    'L1-accountability-consent',
    'L1-real-commitments-only',
    'L1-never-shame',
    'L1-not-a-yesman',
    // memory judgement
    'L1-memory-judgement',
    'L1-memory-invisible',
    'L1-memory-updates',
    // proactive restraint
    'L1-proactive-gate',
    'L1-ghost-ladder',
    'L1-return-is-cheap',
    // playbook precedence
    'L2-playbook-precedence',
  ];

  it.each(NON_NEGOTIABLE)('still defines %s', (id) => {
    expect(ruleById(id)).toBeDefined();
  });

  it('compiles every non-negotiable rule into a prompt', () => {
    const everywhere = [buildStaticPrompt(null), ...TOPICS.map((t) => buildStaticPrompt(t))];
    const missing = NON_NEGOTIABLE.filter(
      (id) => !everywhere.some((p) => p.includes(ruleById(id)!.text)),
    );
    expect(missing).toEqual([]);
  });
});

describe('rule coverage gate', () => {
  // The client's stated fear, made measurable: "make sure the important rules aren't getting
  // lost because of how much training there is".
  it('reaches the model with every non-playbook rule', () => {
    const compiled = new Set(compiledRuleIds(null));
    const orphans = RULES.filter((r) => r.layer !== 'L2' && !compiled.has(r.id));
    expect(orphans.map((r) => r.id)).toEqual([]);
  });

  it('reaches the model with every playbook rule under its own topic', () => {
    const orphans: string[] = [];
    for (const topic of TOPICS) {
      const compiled = new Set(compiledRuleIds(topic));
      orphans.push(
        ...RULES.filter((r) => r.layer === 'L2' && r.topic === topic && !compiled.has(r.id)).map(
          (r) => r.id,
        ),
      );
    }
    expect(orphans).toEqual([]);
  });

  it('renders every compiled rule id as actual prompt text', () => {
    // compiledRuleIds() claiming a rule is present is not evidence it made it into the string.
    const missing: string[] = [];
    for (const topic of [...TOPICS, null]) {
      const prompt = buildStaticPrompt(topic);
      for (const id of compiledRuleIds(topic)) {
        const rule = ruleById(id) as Rule;
        if (!prompt.includes(rule.text)) missing.push(`${topic ?? 'none'}:${id}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('keeps the doctrine sections represented', () => {
    // Spot-check that the load-bearing sections of the rulebook each survived compilation.
    const sections = new Set(RULES.map((r) => r.section));
    for (const required of ['§0', '§1', '§2', '§3', '§4', '§5', '§7', '§9', '§11', '§14', '§16']) {
      expect(sections.has(required)).toBe(true);
    }
  });
});

describe('layer separation', () => {
  it('keeps L0 and L1 disjoint', () => {
    const l0 = new Set(rulesFor('L0').map((r) => r.id));
    expect(rulesFor('L1').some((r) => l0.has(r.id))).toBe(false);
  });

  it('puts identity in L0 and mechanics in L1', () => {
    expect(buildL0()).toContain('friend first and a coach second');
    expect(buildL1()).toContain('default to one bubble');
    expect(buildL0()).not.toContain('default to one bubble');
  });
});
