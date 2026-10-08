import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  areaShares,
  change,
  composite,
  describeChange,
  fetchLearnerGrowth,
  hasProgression,
  skillChanges,
  type LearnerGrowth,
} from './learnerGrowth';

const base: LearnerGrowth = {
  learner_id: 'l1',
  name: 'Test Learner',
  organization: 'Site',
  first_session_at: '2026-03-01T00:00:00Z',
  total_sessions: 60,
  by_area: { learning: 30, tech_skills: 30 },
  early_mix: { learning: 20, tech_skills: 5 },
  recent_mix: { learning: 5, tech_skills: 20 },
  assessed_months: 3,
  first_assessment: { month: '2026-03-01', cognitive: 40, critical_thinking: 35, problem_solving: null, creativity: 50, clarifications: 7 },
  latest_assessment: { month: '2026-07-01', cognitive: 55, critical_thinking: 30, problem_solving: 45, creativity: 50, clarifications: 2 },
  certifications: 2,
  revisit: null,
  checkpoints: null,
};

describe('areaShares', () => {
  it('turns counts into whole percentages', () => {
    expect(areaShares({ learning: 20, tech_skills: 5 })).toEqual({ learning: 80, tech_skills: 20 });
  });
  it('is null when there is nothing to share', () => {
    expect(areaShares(null)).toBeNull();
    expect(areaShares({})).toBeNull();
  });
});

describe('change and describeChange', () => {
  it('is latest minus first and is null when either is missing', () => {
    expect(change(40, 55)).toBe(15);
    expect(change(35.5, 30)).toBe(-5.5);
    expect(change(null, 30)).toBeNull();
    expect(change(40, undefined)).toBeNull();
  });
  it('describes direction in words and arrows, not colour alone', () => {
    expect(describeChange(15)).toBe('▲ +15');
    expect(describeChange(-5.5)).toBe('▼ −5.5');
    expect(describeChange(0)).toBe('no change');
    expect(describeChange(null)).toBe('–');
  });
});

describe('composite', () => {
  it('averages only the scores that exist', () => {
    expect(composite({ cognitive: 60, critical_thinking: 40, problem_solving: null, creativity: 50 })).toBe(50);
    expect(composite({})).toBeNull();
    expect(composite(null)).toBeNull();
  });
});

describe('skillChanges', () => {
  it('compares first and latest for each skill when there are two or more assessed months', () => {
    const rows = skillChanges(base);
    expect(rows.map((r) => r.label)).toEqual(['Cognitive', 'Critical thinking', 'Problem solving', 'Creativity']);
    expect(rows[0]).toMatchObject({ first: 40, latest: 55, delta: 15 });
    expect(rows[1].delta).toBe(-5);
    expect(rows[2].delta).toBeNull();
    expect(rows[3].delta).toBe(0);
  });
  it('shows no change figures with a single assessed month', () => {
    const one = { ...base, assessed_months: 1 };
    expect(hasProgression(one)).toBe(false);
    expect(skillChanges(one).every((r) => r.delta === null)).toBe(true);
  });
});

describe('fetchLearnerGrowth', () => {
  it('returns the rows, an empty list for no data, and raises the refusal', async () => {
    const ok = { rpc: vi.fn(() => Promise.resolve({ data: [base], error: null })) } as unknown as SupabaseClient;
    expect(await fetchLearnerGrowth(ok)).toEqual([base]);
    const none = { rpc: vi.fn(() => Promise.resolve({ data: null, error: null })) } as unknown as SupabaseClient;
    expect(await fetchLearnerGrowth(none)).toEqual([]);
    const refused = { rpc: vi.fn(() => Promise.resolve({ data: null, error: { message: 'not authorized' } })) } as unknown as SupabaseClient;
    await expect(fetchLearnerGrowth(refused)).rejects.toMatchObject({ message: 'not authorized' });
  });
});
