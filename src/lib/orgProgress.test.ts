import { describe, it, expect } from 'vitest';
import { hasScores, showScore, trend } from './orgProgress';

describe('orgProgress helpers', () => {
  it('calls small changes steady and needs a previous month', () => {
    expect(trend(60, 50)).toBe('up');
    expect(trend(50, 60)).toBe('down');
    expect(trend(52, 50)).toBe('steady');
    expect(trend(52, null)).toBeNull();
  });
  it('shows scores under 10 as <10 and missing scores as a dash', () => {
    expect(showScore(0)).toBe('<10');
    expect(showScore(9.4)).toBe('<10');
    expect(showScore(41.6)).toBe('42');
    expect(showScore(null)).toBe('–');
  });
  it('treats a learner with no scores as not scored', () => {
    expect(hasScores(null)).toBe(false);
    expect(hasScores({ cognitive: null, critical_thinking: null, problem_solving: null, creativity: null, sessions: 3 })).toBe(false);
    expect(hasScores({ cognitive: 40, critical_thinking: null, problem_solving: null, creativity: null, sessions: 3 })).toBe(true);
  });
});
