import { describe, it, expect } from 'vitest';
import { estimateTokens, fitToBudget, fitTextToBudget, usesHaiku55 } from './promptBudget.js';

const turn = (role, chars) => ({ role, content: 'x'.repeat(chars) });

describe('promptBudget', () => {
  it('recognises Haiku 5.5 only', () => {
    expect(usesHaiku55('claude-haiku-5-5')).toBe(true);
    expect(usesHaiku55('claude-haiku-4-5')).toBe(false);
    expect(usesHaiku55('claude-sonnet-5-5')).toBe(false);
  });

  it('leaves a small conversation alone', () => {
    const msgs = [turn('user', 300), turn('assistant', 300), turn('user', 300)];
    const r = fitToBudget(msgs, 'be kind');
    expect(r.trimmed).toBe(false);
    expect(r.messages).toHaveLength(3);
  });

  it('drops the oldest turns, keeps the latest, and starts on a user turn', () => {
    const msgs = Array.from({ length: 40 }, (_, i) => turn(i % 2 === 0 ? 'user' : 'assistant', 30_000));
    msgs.push(turn('user', 100));
    const r = fitToBudget(msgs, 'system');
    expect(r.trimmed).toBe(true);
    expect(r.estimatedTokens).toBeLessThanOrEqual(85_000);
    expect(r.messages[0].role).toBe('user');
    expect(r.messages.at(-1)).toEqual(msgs.at(-1));
  });

  it('keeps the tail of one enormous latest message', () => {
    const r = fitToBudget([{ role: 'user', content: 'a'.repeat(600_000) + 'THE QUESTION' }], '');
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0].content.endsWith('THE QUESTION')).toBe(true);
    expect(estimateTokens(r.messages[0].content)).toBeLessThanOrEqual(85_000);
  });

  it('keeps the most recent text of an oversized single prompt', () => {
    const out = fitTextToBudget('old '.repeat(200_000) + 'newest', 500);
    expect(out.endsWith('newest')).toBe(true);
    expect(estimateTokens(out)).toBeLessThanOrEqual(85_000);
  });
});
