import type { SupabaseClient } from '@supabase/supabase-js';

// A dashboard row records that a learner actually started a session. Rows are
// created here, when the learner opens an activity, never in advance.
// dashboard has a unique index on (user_id, learning_module_id), so opening the
// same activity twice (or from two tabs) resolves to one row.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export interface DashboardRowSeed {
  userId: string;
  learningModuleId: string;
  title: string;
  categoryActivity: string;
  subCategory?: string | null;
  gradeLevel?: number | null;
  continent?: string | null;
}

export interface DashboardRowRef {
  id: string;
  progress: 'not started' | 'started' | 'completed';
  chat_history: string | null;
}

const COLUMNS = 'id, progress, chat_history';

async function findRow(client: SupabaseClient, userId: string, moduleId: string): Promise<DashboardRowRef | null> {
  const { data, error } = await client
    .from('dashboard')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('learning_module_id', moduleId)
    .maybeSingle();
  if (error) throw error;
  return (data as DashboardRowRef | null) ?? null;
}

/** Find the learner's row for this module, creating it as 'started' if none exists. */
export async function getOrCreateDashboardRow(client: SupabaseClient, seed: DashboardRowSeed): Promise<DashboardRowRef> {
  const existing = await findRow(client, seed.userId, seed.learningModuleId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const { data, error } = await client
    .from('dashboard')
    .insert({
      user_id: seed.userId,
      learning_module_id: seed.learningModuleId,
      activity: seed.title,
      title: seed.title,
      category_activity: seed.categoryActivity,
      sub_category: seed.subCategory ?? null,
      grade_level: seed.gradeLevel ?? null,
      continent: seed.continent ?? null,
      progress: 'started',
      chat_history: '[]',
      created_at: now,
      updated_at: now,
    })
    .select(COLUMNS)
    .single();

  if (error) {
    // 23505 = unique violation: another tab/request created it first.
    if ((error as { code?: string }).code === '23505') {
      const raced = await findRow(client, seed.userId, seed.learningModuleId);
      if (raced) return raced;
    }
    throw error;
  }
  return data as DashboardRowRef;
}
