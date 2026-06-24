import {
  detectQuestionLoop,
  detectRepeatedChoiceLoop,
  isLoopCallout,
  isAsk,
  topicTokens,
} from '../../src/messaging/question-loop';

// RC-4: the real transcript that slipped past the old detector.
describe('detectRepeatedChoiceLoop', () => {
  it('catches the same either/or choice posed across turns', () => {
    expect(detectRepeatedChoiceLoop([
      'when are you sitting down to train the bot. today or tomorrow. what time.',
      'yes to which one. today or tomorrow. pick one.',
      'now back to the bot. today or tomorrow morning.',
    ])).toBe(true);
  });

  it('catches it even when only two of the last three repeat the choice', () => {
    expect(detectRepeatedChoiceLoop([
      'today or tomorrow?',
      'aight. what else is on your plate.',
      'so the bot — today or tomorrow.',
    ])).toBe(true);
  });

  it('does NOT fire on a single either/or question', () => {
    expect(detectRepeatedChoiceLoop([
      'what should we lock in first.',
      'gym or business — which one.',
      'cool, when.',
    ])).toBe(false);
  });

  it('does NOT fire on different choices in different turns', () => {
    expect(detectRepeatedChoiceLoop([
      'gym or business?',
      'morning or night?',
      'coffee or tea?',
    ])).toBe(false);
  });
});

describe('isAsk imperatives (RC-4)', () => {
  it('treats "pick one" / "choose" as asks even without a question mark', () => {
    expect(isAsk('today or tomorrow. pick one.')).toBe(true);
    expect(isAsk('just choose and lock it.')).toBe(true);
  });
});

describe('topicTokens', () => {
  it('canonicalises workout synonyms to one topic', () => {
    expect(topicTokens('hit the gym').has('workout')).toBe(true);
    expect(topicTokens('what training are you doing').has('workout')).toBe(true);
    expect(topicTokens('movement and cardio').has('workout')).toBe(true);
  });

  it('canonicalises meal words to food', () => {
    expect(topicTokens('what about breakfast').has('food')).toBe(true);
    expect(topicTokens('eggs and coffee').has('food')).toBe(true);
  });

  it('maps clock tokens to the time topic', () => {
    expect(topicTokens('9:20am').has('time')).toBe(true);
    expect(topicTokens('at 7pm').has('time')).toBe(true);
  });

  it('drops filler and bare numbers', () => {
    const t = topicTokens('aight solid locked in 20');
    expect(t.size).toBe(0);
  });
});

describe('isAsk', () => {
  it('flags messages with a question mark', () => {
    expect(isAsk('what time?')).toBe(true);
  });
  it('flags wh-questions without a question mark (real texting)', () => {
    expect(isAsk('what about the gym though')).toBe(true);
  });
  it('does not flag a plain statement', () => {
    expect(isAsk("let's go. 5 days straight.")).toBe(false);
  });
});

describe('detectQuestionLoop', () => {
  // The exact Bianca admin-chat messages (2026-06-23): KIBA circles workout /
  // breakfast / time across three consecutive asks.
  const biancaLoop = [
    "locked in. 9am breakfast, 9:20am workout. what does breakfast actually look like for you right now? and what's the workout. lifting, running, cardio, all three?",
    'solid start. what about the gym or movement though. what time and how long you actually training.',
    'aight. 9:20 at home, 20 mins. what about breakfast. when and what?',
  ];

  it('flags the real Bianca circling case', () => {
    expect(detectQuestionLoop(biancaLoop)).toBe(true);
  });

  it('needs at least three assistant turns', () => {
    expect(detectQuestionLoop(biancaLoop.slice(-2))).toBe(false);
  });

  it('only looks at the most recent three turns', () => {
    const withEarlierNoise = ['nice, 5 days straight 🔥', ...biancaLoop];
    expect(detectQuestionLoop(withEarlierNoise)).toBe(true);
  });

  it('does NOT flag three varied, non-overlapping questions', () => {
    expect(
      detectQuestionLoop([
        "how'd the meeting go?",
        'you sleep okay?',
        "what's first on the list today?",
      ]),
    ).toBe(false);
  });

  it('does NOT flag when a recent turn is a statement, not a question', () => {
    expect(
      detectQuestionLoop([
        'what time you training?',
        "let's go. that's logged. 💪",
        'what time you training?',
      ]),
    ).toBe(false);
  });
});

describe('isLoopCallout', () => {
  it.each([
    'you already asked that',
    'bro i just told you',
    'we keep going in circles',
    'i cant seem to get past this circle',
    'stop asking the same question',
    'i already answered that',
  ])('flags an explicit loop complaint: %s', (msg) => {
    expect(isLoopCallout(msg)).toBe(true);
  });

  it.each([
    'i went to the gym today',
    'what should i eat for breakfast',
    'can you remind me at 7am',
  ])('does not flag normal messages: %s', (msg) => {
    expect(isLoopCallout(msg)).toBe(false);
  });
});
