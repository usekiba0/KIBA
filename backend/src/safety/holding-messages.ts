const HOLDING_MESSAGES = [
  "Thank you for trusting me with this. What you're feeling is real and it matters. I'm connecting you with someone who can support you — please hang tight. If this is urgent, text 988 (Crisis Line) now.",
  "I hear you, and I'm glad you reached out. You don't have to face this alone — a real person is being notified right now. You matter. Text 988 if you need immediate support.",
  "What you shared takes courage. I'm pausing our session to make sure you get the right support. Someone will be in touch shortly. In an emergency, please text or call 988.",
];

export function getHoldingMessage(): string {
  return HOLDING_MESSAGES[Math.floor(Math.random() * HOLDING_MESSAGES.length)];
}
