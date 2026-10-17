import { describe, it, expect } from 'vitest';
import { buildReminder, dueInfo } from './teamReminder.js';

const now = new Date('2026-11-01T08:00:00Z');
const reviews = [
  { title: 'Safeguarding policy', cadence_days: 365, last_reviewed_at: null, audience: 'all_leaders' },
  { title: 'Security findings', cadence_days: 30, last_reviewed_at: '2026-09-20T00:00:00Z', audience: 'platform_team' },
  { title: 'Decision log', cadence_days: 90, last_reviewed_at: '2026-10-17T00:00:00Z', audience: 'all_leaders' },
];
const tasks = [
  { title: 'Run training', status: 'open', due_date: '2026-10-20', audience: 'all_leaders' },
  { title: 'Platform only task', status: 'open', due_date: null, audience: 'platform_team' },
  { title: 'Finished', status: 'done', due_date: null, audience: 'all_leaders' },
];
const proposals = [{ title: 'Faster login', status: 'proposed' }, { title: 'Old', status: 'released' }];

describe('dueInfo', () => {
  it('matches the page logic', () => {
    expect(dueInfo(reviews[0], now).state).toBe('never');
    expect(dueInfo(reviews[1], now).state).toBe('overdue');
    expect(dueInfo(reviews[2], now).state).toBe('ok');
  });
});

describe('buildReminder', () => {
  it('shows leaders only items shared with all leaders, and no proposals', () => {
    const r = buildReminder({ audience: 'all_leaders', reviews, tasks, proposals, now });
    expect(r.counts).toEqual({ reviews: 1, tasks: 1, proposals: 0 });
    expect(r.text).toContain('Safeguarding policy');
    expect(r.text).not.toContain('Security findings');
    expect(r.text).not.toContain('Platform only task');
    expect(r.text).not.toContain('Faster login');
  });
  it('shows the platform team everything open', () => {
    const r = buildReminder({ audience: 'platform_team', reviews, tasks, proposals, now });
    expect(r.counts).toEqual({ reviews: 2, tasks: 2, proposals: 1 });
    expect(r.text).toContain('overdue by 12 days');
    expect(r.text).toContain('overdue, due 2026-10-20');
  });
  it('returns null when nothing needs attention', () => {
    expect(buildReminder({ audience: 'all_leaders', reviews: [reviews[2]], tasks: [], proposals: [], now })).toBeNull();
  });
  it('escapes HTML in titles', () => {
    const r = buildReminder({ audience: 'all_leaders', reviews: [{ title: '<b>x</b>', cadence_days: 30, last_reviewed_at: null, audience: 'all_leaders' }], tasks: [], proposals: [], now });
    expect(r.html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
