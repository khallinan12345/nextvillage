import { describe, it, expect } from 'vitest';
import { buildBoardReport, previousMonth } from './boardReport.js';

describe('previousMonth', () => {
  it('returns the month before now', () => {
    expect(previousMonth(new Date('2026-11-05T09:00:00Z'))).toEqual({ start: '2026-10-01', label: 'October 2026' });
  });
  it('wraps over the new year', () => {
    expect(previousMonth(new Date('2027-01-05T09:00:00Z'))).toEqual({ start: '2026-12-01', label: 'December 2026' });
  });
});

const stats = {
  new_students_by_org: [
    { name: 'Lab A', country: 'Nigeria', new_students: 7, total_students: 80 },
    { name: 'Empty Org', country: 'Ghana', new_students: 0, total_students: 0 },
  ],
  new_certifications: 3,
  certifications_by_title: [{ title: 'AI Proficiency Certification', count: 3 }],
  new_organizations: [{ name: 'Org <X>', country: 'Kenya' }],
  sessions: 1030, active_learners: 40,
  ai_cost_total_usd: 58.48, ai_requests: 100,
  ai_cost_by_provider: [{ provider: 'anthropic', usd: 58.48, requests: 60 }, { provider: 'groq', usd: 0, requests: 40 }],
};

describe('buildBoardReport', () => {
  const r = buildBoardReport({ stats, monthLabel: 'October 2026' });
  it('titles the email Impact Mining Program News', () => {
    expect(r.subject).toBe('Impact Mining Program News: October 2026');
    expect(r.html).toContain('Impact Mining Program News');
  });
  it('reports all five items', () => {
    expect(r.text).toContain('New students (African partner organizations): 7');
    expect(r.text).toContain('New certifications granted: 3');
    expect(r.text).toContain('New organizations: 1');
    expect(r.text).toContain('Learning sessions: 1,030');
    expect(r.text).toContain('AI costs: $58.48');
    expect(r.text).toContain('about $0.06 per session');
  });
  it('leaves out empty organizations and escapes names', () => {
    expect(r.text).not.toContain('Empty Org');
    expect(r.html).toContain('Org &lt;X&gt;');
  });
  it('handles an empty month', () => {
    const e = buildBoardReport({ stats: {}, monthLabel: 'May 2026' });
    expect(e.text).toContain('New certifications granted: 0');
    expect(e.text).toContain('AI costs: $0.00');
  });
});
