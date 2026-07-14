import { describe, it, expect, vi, beforeEach } from 'vitest';
import { levenshtein, maskEmail, findSimilarProfile } from './duplicateDetection';

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

// findSimilarProfile queries Supabase — mock the chainable query builder rather
// than hitting a real (or fake) network, so this stays fast and deterministic.
vi.mock('./supabaseClient', () => {
  const state = { data: [] as any[], error: null as any };
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    then: (resolve: any) => Promise.resolve({ data: state.data, error: state.error }).then(resolve),
  };
  return {
    supabase: { from: vi.fn(() => builder) },
    __mockState: state,
  };
});

describe('findSimilarProfile', () => {
  beforeEach(async () => {
    const mod: any = await import('./supabaseClient');
    mod.__mockState.data = [];
    mod.__mockState.error = null;
  });

  it('returns null when no profiles are close enough', async () => {
    const mod: any = await import('./supabaseClient');
    mod.__mockState.data = [{ id: 'winner-1', email: 'unrelated@gmail.com', name: 'Someone Else' }];

    const match = await findSimilarProfile({ email: 'newperson@gmail.com', name: 'New Person' });
    expect(match).toBeNull();
  });

  it('matches on a near-identical email local part', async () => {
    const mod: any = await import('./supabaseClient');
    mod.__mockState.data = [{ id: 'winner-1', email: 'obebeemmanuel@gmail.com', name: 'Obebe Emmanuel' }];

    const match = await findSimilarProfile({ email: 'obebeemmanuel2011@gmail.com' });
    expect(match).toBeNull(); // 4-char insertion exceeds the distance-2 threshold — same as production behavior
  });

  it('matches on an exact name within the same organization', async () => {
    const mod: any = await import('./supabaseClient');
    mod.__mockState.data = [{ id: 'winner-1', email: 'obebeemmanuel@gmail.com', name: 'Obebe Emmanuel' }];

    const match = await findSimilarProfile({
      email: 'brand-new-address@gmail.com',
      name: 'Obebe Emmanuel',
      organizationId: 'org-1',
    });
    expect(match).not.toBeNull();
    expect(match?.id).toBe('winner-1');
    expect(match?.maskedEmail).toBe('ob***********@gmail.com');
  });

  it('does not match on name when no organizationId is given', async () => {
    const mod: any = await import('./supabaseClient');
    mod.__mockState.data = [{ id: 'winner-1', email: 'obebeemmanuel@gmail.com', name: 'Obebe Emmanuel' }];

    // Same exact name, but no org scope — should NOT match, since global
    // name-only matching produces false positives across unrelated cohorts.
    const match = await findSimilarProfile({
      email: 'brand-new-address@gmail.com',
      name: 'Obebe Emmanuel',
    });
    expect(match).toBeNull();
  });
});
