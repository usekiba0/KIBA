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
