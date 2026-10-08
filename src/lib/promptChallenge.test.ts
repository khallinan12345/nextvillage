import { describe, it, expect } from 'vitest';
import {
  MIN_LEARNER_MESSAGES,
  buildChallengeSystemPrompt,
  canFinish,
  challengeGreeting,
  cleanReply,
  learnerMessageCount,
  readTranscript,
  toModelMessages,
  type ChallengeMessage,
} from './promptChallenge';

const m = (role: 'user' | 'assistant', content: string): ChallengeMessage => ({ role, content, timestamp: '2026-10-08T10:00:00Z' });

describe('buildChallengeSystemPrompt', () => {
  const mod = {
    title: 'Prompt Improvement Challenge',
    description: 'Start with a basic prompt and refine it.',
    ai_facilitator_instructions: 'Guide students to start with a basic prompt. Ask, �What could make your question clearer?�',
  };

  it('uses the activity text plus the fixed rules, in a fixed order', () => {
    const p = buildChallengeSystemPrompt(mod);
    expect(p.indexOf('Guide students')).toBeLessThan(p.indexOf('Activity: Prompt Improvement Challenge'));
    expect(p.indexOf('Activity:')).toBeLessThan(p.indexOf('How to respond:'));
    expect(p).toContain('under 100 words');
    expect(p).toContain('Write plain text only');
    expect(p).toContain("Do not write or rewrite the learner's work");
  });

  it('repairs broken apostrophes and is identical for identical input (no personalization)', () => {
    expect(buildChallengeSystemPrompt(mod)).not.toContain('�');
    expect(buildChallengeSystemPrompt(mod)).toBe(buildChallengeSystemPrompt({ ...mod }));
  });

  it('skips missing parts without leaving gaps', () => {
    const p = buildChallengeSystemPrompt({ title: 'T', description: null, ai_facilitator_instructions: null });
    expect(p.startsWith('Activity: T')).toBe(true);
    expect(p).not.toMatch(/\n\n\n/);
  });
});

describe('finishing', () => {
  it('needs enough learner messages, counting only the learner', () => {
    const msgs = [m('assistant', 'hi'), m('user', 'a'), m('assistant', 'q'), m('user', 'b')];
    expect(learnerMessageCount(msgs)).toBe(2);
    expect(canFinish(msgs)).toBe(false);
    expect(canFinish([...msgs, m('user', 'c')])).toBe(MIN_LEARNER_MESSAGES <= 3);
  });
});

describe('toModelMessages', () => {
  it('drops the greeting so the model starts with the learner', () => {
    const out = toModelMessages([m('assistant', challengeGreeting('X')), m('user', 'hello'), m('assistant', 'ok')]);
    expect(out).toEqual([{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'ok' }]);
  });
  it('sends nothing before the learner has spoken', () => {
    expect(toModelMessages([m('assistant', 'hi')])).toEqual([]);
  });
});

describe('readTranscript', () => {
  it('restores saved messages and drops malformed ones', () => {
    const saved = [
      { role: 'assistant', content: 'Hello', timestamp: '2026-10-08T10:00:00Z' },
      { role: 'user', content: '' },
      { role: 'system', content: 'x' },
      null,
      { role: 'user', content: 'my prompt' },
    ];
    const out = readTranscript(saved);
    expect(out.map((x) => x.content)).toEqual(['Hello', 'my prompt']);
    expect(readTranscript('nope')).toEqual([]);
  });
});

describe('cleanReply', () => {
  it('removes bold and heading markers but keeps the words', () => {
    expect(cleanReply('Now look. **What could make your question clearer?** Think.')).toBe('Now look. What could make your question clearer? Think.');
    expect(cleanReply('## Step one\nAsk her.')).toBe('Step one\nAsk her.');
    expect(cleanReply('__Listen__ well')).toBe('Listen well');
  });
  it('turns list markers into plain bullets and drops single-asterisk emphasis', () => {
    expect(cleanReply('- ask about fish\n* ask about rain')).toBe('• ask about fish\n• ask about rain');
    expect(cleanReply('Write *exactly* what she says')).toBe('Write exactly what she says');
  });
  it('leaves ordinary text and emoji alone', () => {
    expect(cleanReply('What a good idea! 🌿')).toBe('What a good idea! 🌿');
    expect(cleanReply('2 * 3 is six')).toBe('2 * 3 is six');
  });
});
