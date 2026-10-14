import { describe, it, expect } from 'vitest';
import { parseBirthYear, approxAge, latestBirthYear } from './birthYear';

const NOW = new Date('2026-10-14T00:00:00Z');

describe('parseBirthYear', () => {
  it('accepts a normal learner birth year', () => {
    expect(parseBirthYear('2010', NOW)).toEqual({ ok: true, year: 2010 });
  });
  it('trims whitespace', () => {
    expect(parseBirthYear(' 1985 ', NOW)).toEqual({ ok: true, year: 1985 });
  });
  it('rejects non-4-digit input', () => {
    for (const bad of ['', '10', '20100', 'abcd', '20.1', '-2010']) {
      expect(parseBirthYear(bad, NOW).ok).toBe(false);
    }
  });
  it('rejects implausibly old and future years', () => {
    expect(parseBirthYear('1900', NOW).ok).toBe(false);
    expect(parseBirthYear('2026', NOW).ok).toBe(false);
    expect(parseBirthYear('2024', NOW).ok).toBe(false);
  });
  it('allows the latest accepted year', () => {
    expect(parseBirthYear(String(latestBirthYear(NOW)), NOW).ok).toBe(true);
  });
});

describe('approxAge', () => {
  it('is the calendar-year difference', () => {
    expect(approxAge(2010, NOW)).toBe(16);
  });
});
