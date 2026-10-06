import { describe, it, expect } from 'vitest';
import { shortDisplayName } from './displayName';

describe('shortDisplayName', () => {
  it('shows first name and last initial', () => {
    expect(shortDisplayName('Daniel Peace Azibaolari')).toBe('Daniel A.');
    expect(shortDisplayName('Osu Favour')).toBe('Osu F.');
  });
  it('uppercases the initial and ignores stray spaces', () => {
    expect(shortDisplayName(' Adongoi   glory ')).toBe('Adongoi G.');
  });
  it('leaves one-word names alone', () => {
    expect(shortDisplayName('moseslondomboy')).toBe('moseslondomboy');
  });
  it('falls back to Member for blank or missing names', () => {
    expect(shortDisplayName('   ')).toBe('Member');
    expect(shortDisplayName(null)).toBe('Member');
    expect(shortDisplayName(undefined)).toBe('Member');
  });
});
