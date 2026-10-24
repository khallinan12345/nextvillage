import { describe, it, expect } from 'vitest';
import { idleState, msUntilSignOut, formatCountdown, readLastActivity, writeLastActivity, IDLE_LIMIT_MS, WARN_BEFORE_MS, ACTIVITY_KEY } from './idleSignOut';

describe('idleState', () => {
  const t0 = 1_000_000;
  it('is active until two minutes before the limit', () => {
    expect(idleState(t0 + 1000, t0)).toBe('active');
    expect(idleState(t0 + IDLE_LIMIT_MS - WARN_BEFORE_MS - 1, t0)).toBe('active');
  });
  it('warns for the last two minutes', () => {
    expect(idleState(t0 + IDLE_LIMIT_MS - WARN_BEFORE_MS, t0)).toBe('warn');
    expect(idleState(t0 + IDLE_LIMIT_MS - 1, t0)).toBe('warn');
  });
  it('expires at the limit', () => {
    expect(idleState(t0 + IDLE_LIMIT_MS, t0)).toBe('expired');
    expect(idleState(t0 + IDLE_LIMIT_MS * 5, t0)).toBe('expired');
  });
});

describe('countdown', () => {
  it('counts down to zero and never goes negative', () => {
    expect(msUntilSignOut(IDLE_LIMIT_MS - 90_000, 0)).toBe(90_000);
    expect(msUntilSignOut(IDLE_LIMIT_MS * 2, 0)).toBe(0);
  });
  it('formats minutes and seconds', () => {
    expect(formatCountdown(90_000)).toBe('1:30');
    expect(formatCountdown(65_001)).toBe('1:06');
    expect(formatCountdown(0)).toBe('0:00');
  });
});

describe('stored activity time', () => {
  it('round-trips through storage', () => {
    const store: Record<string, string> = {};
    const storage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
    expect(readLastActivity(storage)).toBeNull();
    writeLastActivity(12345, storage);
    expect(store[ACTIVITY_KEY]).toBe('12345');
    expect(readLastActivity(storage)).toBe(12345);
  });
  it('survives blocked or garbage storage', () => {
    expect(readLastActivity({ getItem: () => { throw new Error('blocked'); } })).toBeNull();
    expect(readLastActivity({ getItem: () => 'not a number' })).toBeNull();
    expect(() => writeLastActivity(1, { setItem: () => { throw new Error('blocked'); } })).not.toThrow();
  });
});
