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

// Columns that identify or catalog a row. Anything else holding a value means
// the learner did real work in it (web projects, content sessions, scores...).
// Mirrors dashboard_row_is_placeholder() in the database.
const NON_CONTENT_KEYS = new Set([
  'id', 'user_id', 'title', 'activity', 'category_activity', 'sub_category',
  'progress', 'learning_module_id', 'grade_level', 'continent', 'country',
  'created_at', 'updated_at', 'chat_history', 'team_activity', 'learning_modules',
]);

function isEmptyValue(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return ['', '[]', 'null', '{}', '""'].includes(v.trim());
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}

/**
 * True for a leftover pre-seeded row: never started, no chat, and no content
 * in any column. Older learners still have these; they are not sessions and
 * are hidden from progress displays and counts. A 'not started' row that holds
 * work (a web project, a content session, a score) is NOT a placeholder.
 */
export function isPlaceholderRow(row: Record<string, unknown>): boolean {
  if (row.progress !== 'not started') return false;
  if (!isEmptyValue(row.chat_history)) return false;
  return Object.entries(row).every(([k, v]) => NON_CONTENT_KEYS.has(k) || isEmptyValue(v));
}
