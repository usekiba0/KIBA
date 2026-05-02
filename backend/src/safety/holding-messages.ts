const HOLDING_MESSAGES = [
  "I hear you. Pausing to get you real support. Text 988 now if urgent — help is there 24/7.",
  "You reached out and that matters. A person is being notified. Text 988 for immediate support.",
  "Thank you for sharing. Getting you the right support now. For emergencies text or call 988.",
];

export function getHoldingMessage(): string {
  return HOLDING_MESSAGES[Math.floor(Math.random() * HOLDING_MESSAGES.length)];
}
