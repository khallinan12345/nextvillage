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

describe('donations section', () => {
  const donations = {
    count: 2, total_usd: 350, all_time_count: 5, all_time_usd: 1200,
    received_by_currency: [{ currency: 'NGN', amount: 512000 }],
    items: [
      { received_on: '2026-10-04', donor: 'Jane <Doe>', amount_usd: 100, purpose: 'Cohort laptops' },
      { received_on: '2026-10-20', donor: 'Anonymous', amount_usd: 250, purpose: null, channel: 'gofundme' },
    ],
  };
  const r = buildBoardReport({ stats, donations, monthLabel: 'October 2026' });
  it('lists the month with totals, donors, purposes and the all-time figure', () => {
    expect(r.text).toContain('Donations received: $350.00 from 2 donations');
    expect(r.text).toContain('Oct 4: Jane <Doe> gave $100.00 (Cohort laptops)');
    expect(r.text).toContain('Oct 20: Anonymous gave $250.00 via GoFundMe');
    expect(r.text).toContain('Oct 4: Jane <Doe> gave $100.00 (Cohort laptops)');
    expect(r.text).toContain('512,000 NGN');
    expect(r.text).toContain('All time: $1,200.00 from 5 donations to date');
    expect(r.counts.donations).toBe(2);
  });
  it('escapes donor names in the HTML', () => {
    expect(r.html).toContain('Jane &lt;Doe&gt;');
    expect(r.html).not.toContain('Jane <Doe>');
  });
  it('says none when the month had no donations', () => {
    const e = buildBoardReport({ stats, donations: { count: 0, total_usd: 0, items: [], all_time_count: 1, all_time_usd: 50 }, monthLabel: 'May 2026' });
    expect(e.text).toContain('Donations received: none this month');
    expect(e.text).toContain('All time: $50.00 from 1 donation to date');
  });
  it('leaves the section out when donations could not be fetched', () => {
    const e = buildBoardReport({ stats, donations: null, monthLabel: 'May 2026' });
    expect(e.text).not.toContain('Donations');
    expect(e.html).not.toContain('Donations');
  });
});
