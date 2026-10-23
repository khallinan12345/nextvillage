import { describe, it, expect } from 'vitest';
import { summariseCertRows } from './certSummary.js';

describe('summariseCertRows', () => {
  it('ignores scaffolded learning rows even when they carry a certification score', () => {
    const rows = [
      { category_activity: 'AI Learning', activity: 'Lesson 1', progress: 'completed', certification_evaluation_score: 3 },
      { category_activity: 'Skills', activity: 'Lesson 2', progress: 'started', certification_evaluation_score: 2.5 },
    ];
    const s = summariseCertRows(rows);
    expect(s.names).toEqual([]);
    expect(s.passed).toEqual([]);
    expect(s.avgScore).toBeNull();
  });
  it('counts a certification as passed only when its page completed it', () => {
    const rows = [
      { category_activity: 'Certification', activity: 'AI Proficiency Certification', progress: 'completed', certification_ai_proficiency_ethics_responsibility_score: 3 },
      { category_activity: 'Certification', activity: 'Web Development Certification', progress: 'started', certification_web_dev_score: 1 },
    ];
    const s = summariseCertRows(rows);
    expect(s.names).toHaveLength(2);
    expect(s.passed).toEqual(['AI Proficiency Certification']);
    expect(s.avgScore).toBe(2);
  });
  it('handles no rows', () => {
    expect(summariseCertRows(null).names).toEqual([]);
  });
});
