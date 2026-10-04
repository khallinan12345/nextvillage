import { describe, it, expect } from 'vitest';
import { levenshtein, maskEmail, findBestMatch } from './duplicateMatch.js';

describe('levenshtein', () => {
  it('is 0 for identical strings', () => {
    expect(levenshtein('obebe', 'obebe')).toBe(0);
  });

  it('catches a one-character typo', () => {
    expect(levenshtein('princess', 'princss')).toBe(1);
  });

  it('is large for unrelated strings', () => {
    expect(levenshtein('obebeemmanuel', 'ebheleBenjamin'.toLowerCase())).toBeGreaterThan(5);
  });
});

describe('maskEmail', () => {
  it('keeps the first two characters and masks the rest of the local part', () => {
    expect(maskEmail('obebeemmanuel@gmail.com')).toBe('ob***********@gmail.com');
  });

  it('returns the input unchanged if there is no @', () => {
    expect(maskEmail('not-an-email')).toBe('not-an-email');
  });
});

describe('findBestMatch', () => {
  const existing = [{ id: 'winner-1', email: 'obebeemmanuel@gmail.com', name: 'Obebe Emmanuel' }];

  it('returns null when no profiles are close enough', () => {
    const others = [{ id: 'winner-1', email: 'unrelated@gmail.com', name: 'Someone Else' }];
    expect(findBestMatch(others, { email: 'newperson@gmail.com', name: 'New Person', matchNames: false })).toBeNull();
  });

  it('matches a one-character email typo', () => {
    expect(findBestMatch(existing, { email: 'obebeemanuel@gmail.com', matchNames: false })?.id).toBe('winner-1');
  });

  it('does not match a 4-character email difference', () => {
    expect(findBestMatch(existing, { email: 'obebeemmanuel2011@gmail.com', matchNames: false })).toBeNull();
  });

  it('matches on an exact name within the same organization', () => {
    const match = findBestMatch(existing, {
      email: 'brand-new-address@gmail.com', name: 'Obebe Emmanuel', matchNames: true,
    });
    expect(match?.id).toBe('winner-1');
  });

  it('does not match on name when the search is not scoped to an organization', () => {
    // Global name-only matching produces false positives across cohorts.
    expect(findBestMatch(existing, {
      email: 'brand-new-address@gmail.com', name: 'Obebe Emmanuel', matchNames: false,
    })).toBeNull();
  });
});
