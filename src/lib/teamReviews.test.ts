import { describe, it, expect } from 'vitest';
import { dueInfo, sortByUrgency, describeDue } from './teamReviews';

const now = new Date('2026-10-17T12:00:00Z');
const item = (days: number, last: string | null) => ({ cadence_days: days, last_reviewed_at: last });

describe('dueInfo', () => {
  it('flags an item that was never reviewed', () => {
    expect(dueInfo(item(90, null), now).state).toBe('never');
  });
  it('is ok well before the due date', () => {
    expect(dueInfo(item(90, '2026-10-01T12:00:00Z'), now).state).toBe('ok');
  });
  it('is soon within 14 days', () => {
    const i = dueInfo(item(30, '2026-09-25T12:00:00Z'), now);
    expect(i.state).toBe('soon');
    expect(i.days).toBe(8);
  });
  it('is overdue after the due date', () => {
    const i = dueInfo(item(30, '2026-09-01T12:00:00Z'), now);
    expect(i.state).toBe('overdue');
    expect(describeDue(i)).toBe('Overdue by 16 days');
  });
});

describe('sortByUrgency', () => {
  it('puts never-reviewed first, then overdue, then soonest', () => {
    const sorted = sortByUrgency([item(90, '2026-10-10T12:00:00Z'), item(30, '2026-09-01T12:00:00Z'), item(365, null)], now);
    expect(sorted.map(s => dueInfo(s, now).state)).toEqual(['never', 'overdue', 'ok']);
  });
});
