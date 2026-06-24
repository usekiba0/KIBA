import { Message, MessageRole } from '../../data/entities/message.entity';

export function buildSummarisationPrompt(messages: Message[]): string {
  const conversation = messages
    .map(m => `${m.role === MessageRole.USER ? 'User' : 'Coach'}: ${m.content}`)
    .join('\n\n');

  return `Summarise this coaching conversation in 100–200 words. Extract and preserve:
1. User's goals and what they want to achieve
2. Progress made or mentioned
3. Challenges or obstacles raised
4. User's preferred communication style
5. Any explicit commitments or actions agreed
6. Health metrics or numbers mentioned

Write as a compact paragraph (not a list) that will be used as future context for the AI coach.

Conversation:
${conversation}`;
}

/**
 * LAYER 2 — the evolving relationship digest. Merges the user's EXISTING memory
 * with the most recent conversation into a single running picture of who they
 * are, so KIBA remembers them across days like a real partner would. This is
 * loaded into every coaching prompt; raw recent turns carry the immediate past.
 */
export function buildRelationshipMemoryPrompt(
  existingMemory: string | null | undefined,
  messages: Message[],
): string {
  const conversation = messages
    .map((m) => `${m.role === MessageRole.USER ? 'User' : 'Coach'}: ${m.content}`)
    .join('\n\n');

  const prior = existingMemory && existingMemory.trim()
    ? existingMemory.trim()
    : '(nothing yet — this is the first thing you\'re learning about them)';

  return `You are KIBA, an accountability partner. This is your private memory of ONE person — what makes you feel like you actually know them, not a chatbot reading a chart. Update it with what just happened.

WHAT YOU REMEMBER ABOUT THEM SO FAR:
${prior}

YOUR MOST RECENT CONVERSATION WITH THEM:
${conversation}

Rewrite your memory as a single compact prose digest of 150–300 words. Keep it human and specific. Preserve:
- who they are and their situation (work, relationships, city, life context)
- their goals and the real WHY underneath them
- recent life events and how they've been feeling (mood, stress, wins, losses)
- what they've committed to, and what they actually followed through on vs skipped
- their patterns, triggers, and how they like to be talked to
- durable facts worth remembering (names of people/pets, key dates, preferences)

Carry forward important older context; drop trivia and small talk. Do NOT invent anything they didn't actually say or imply. Write only the updated memory, as plain prose — no headers, no preamble, no bullet labels.`;
}
