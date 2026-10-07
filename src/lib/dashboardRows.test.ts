import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getOrCreateDashboardRow, isPlaceholderRow, isUuid } from './dashboardRows';

const seed = {
  userId: 'u1',
  learningModuleId: '11111111-1111-1111-1111-111111111111',
  title: 'Solar basics',
  categoryActivity: 'Skills',
  subCategory: 'Energy',
  gradeLevel: 4,
  continent: 'Africa',
};

// Minimal fake of the chained supabase calls the helper uses.
function fakeClient(opts: {
  selects: Array<{ data: unknown; error?: unknown }>;
  insert?: { data?: unknown; error?: unknown };
}) {
  const insertSpy = vi.fn();
  let selectCall = 0;
  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => {
              const r = opts.selects[Math.min(selectCall++, opts.selects.length - 1)];
              return Promise.resolve({ data: r.data, error: r.error ?? null });
            }),
          })),
        })),
      })),
      insert: vi.fn((row: Record<string, unknown>) => {
        insertSpy(row);
        return {
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({ data: opts.insert?.data ?? null, error: opts.insert?.error ?? null })),
          })),
        };
      }),
    })),
  } as unknown as SupabaseClient;
  return { client, insertSpy };
}

describe('isUuid', () => {
  it('accepts real ids and rejects catalog placeholders', () => {
    expect(isUuid('11111111-1111-1111-1111-111111111111')).toBe(true);
    expect(isUuid('mock-solar-1')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe('getOrCreateDashboardRow', () => {
  it('returns the existing row without inserting', async () => {
    const existing = { id: 'row1', progress: 'completed', chat_history: '[]' };
    const { client, insertSpy } = fakeClient({ selects: [{ data: existing }] });
    expect(await getOrCreateDashboardRow(client, seed)).toEqual(existing);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("creates a 'started' row when none exists", async () => {
    const created = { id: 'row2', progress: 'started', chat_history: '[]' };
    const { client, insertSpy } = fakeClient({ selects: [{ data: null }], insert: { data: created } });
    expect(await getOrCreateDashboardRow(client, seed)).toEqual(created);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy.mock.calls[0][0]).toMatchObject({
      user_id: 'u1',
      learning_module_id: seed.learningModuleId,
      category_activity: 'Skills',
      progress: 'started',
      grade_level: 4,
    });
  });

  it('falls back to the existing row if another request created it first', async () => {
    const raced = { id: 'row3', progress: 'started', chat_history: '[]' };
    const { client } = fakeClient({
      selects: [{ data: null }, { data: raced }],
      insert: { error: { code: '23505', message: 'duplicate key' } },
    });
    expect(await getOrCreateDashboardRow(client, seed)).toEqual(raced);
  });

  it('throws on other insert errors so callers can keep their local fallback', async () => {
    const { client } = fakeClient({ selects: [{ data: null }], insert: { error: { code: '42501', message: 'denied' } } });
    await expect(getOrCreateDashboardRow(client, seed)).rejects.toMatchObject({ code: '42501' });
  });
});

describe('isPlaceholderRow', () => {
  const base = { id: 'r', user_id: 'u', activity: 'a', category_activity: 'Skills', team_activity: 'no' };

  it('flags never-started rows with no chat or content', () => {
    expect(isPlaceholderRow({ ...base, progress: 'not started', chat_history: null, web_dev_pages: null })).toBe(true);
    expect(isPlaceholderRow({ ...base, progress: 'not started', chat_history: '[]', web_dev_pages: [] })).toBe(true);
    expect(isPlaceholderRow({ ...base, progress: 'not started' })).toBe(true);
  });

  it('keeps anything the learner actually did', () => {
    expect(isPlaceholderRow({ ...base, progress: 'started', chat_history: '[]' })).toBe(false);
    expect(isPlaceholderRow({ ...base, progress: 'completed', chat_history: null })).toBe(false);
    expect(isPlaceholderRow({ ...base, progress: 'not started', chat_history: '[{"role":"user","content":"hi"}]' })).toBe(false);
    expect(isPlaceholderRow({ ...base, progress: 'not started', certification_evaluation_score: 3 })).toBe(false);
  });

  it('keeps not-started rows that hold other work', () => {
    expect(isPlaceholderRow({ ...base, progress: 'not started', web_dev_session_id: '07r2r9e' })).toBe(false);
    expect(isPlaceholderRow({ ...base, progress: 'not started', business_canvas: { offer: 'x' } })).toBe(false);
    expect(isPlaceholderRow({ ...base, progress: 'not started', fs_pages: [{ path: 'a' }] })).toBe(false);
  });
});
