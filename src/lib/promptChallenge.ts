// Fixed pieces of the Prompt Challenge so every learner gets the same activity
// at every checkpoint: no personalization, no personality profile, and the same
// facilitator rules. Only the activity's own title, description and facilitator
// instructions change (a revisit runs the learner's own first AI Learning
// activity the same way).

export interface ChallengeModule {
  title: string;
  description: string | null;
  ai_facilitator_instructions: string | null;
}

export interface ChallengeMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

/** Learner messages needed before "I'm finished" is offered (scoring needs at least two). */
export const MIN_LEARNER_MESSAGES = 3;

// Some stored text has broken apostrophes (U+FFFD from an old encoding slip).
const clean = (s: string | null | undefined) => (s ?? '').replace(/�/g, "'").trim();

export function challengeGreeting(title: string): string {
  return `Hello! This is a short activity called "${title}". There are no wrong answers. Tell me what you would like to try first.`;
}

export function buildChallengeSystemPrompt(module: ChallengeModule): string {
  return [
    clean(module.ai_facilitator_instructions),
    `Activity: ${clean(module.title)}`,
    clean(module.description),
    [
      'How to respond:',
      '- The learner lives in Oloibiri, Nigeria, and may be learning English as a second language. Use simple, warm English.',
      '- Keep every reply under 100 words and ask only one question at a time.',
      "- Do not write or rewrite the learner's work for them. Ask what they would change and why, and let them try again.",
      '- Stay on this activity. If the learner goes off topic, gently bring them back.',
    ].join('\n'),
  ]
    .filter((part) => part !== '')
    .join('\n\n');
}

export function learnerMessageCount(messages: ChallengeMessage[]): number {
  return messages.filter((m) => m.role === 'user' && m.content.trim() !== '').length;
}

export function canFinish(messages: ChallengeMessage[]): boolean {
  return learnerMessageCount(messages) >= MIN_LEARNER_MESSAGES;
}

/** Messages to send to the model: the greeting is ours, and the model must start with the learner. */
export function toModelMessages(messages: ChallengeMessage[]): { role: 'user' | 'assistant'; content: string }[] {
  const firstLearner = messages.findIndex((m) => m.role === 'user');
  if (firstLearner === -1) return [];
  return messages.slice(firstLearner).map(({ role, content }) => ({ role, content }));
}

/** Read a saved transcript (jsonb) back into messages; anything unreadable is dropped. */
export function readTranscript(raw: unknown): ChallengeMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content !== '')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content as string,
      timestamp: typeof m.timestamp === 'string' ? m.timestamp : new Date().toISOString(),
    }));
}
