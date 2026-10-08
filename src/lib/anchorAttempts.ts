import type { SupabaseClient } from '@supabase/supabase-js';

// Client side of the anchor-task checkpoints. The database decides what is due
// and records the session count (see 20261008120000_anchor_attempts.sql); this
// file only asks and reports. The learner-facing card is built on top of it.

export type Checkpoint = 0 | 25 | 50 | 100;
export type AttemptKind = 'checkpoint' | 'revisit';

export interface SessionsByArea {
  learning: number;
  foundational: number;
  tech_skills: number;
  community_impact: number;
  ai_playground: number;
}

export interface CheckpointStatus {
  total_sessions: number;
  by_area: SessionsByArea;
  eligible_learner: boolean;
  due_checkpoint: Checkpoint | null;
  anchor_module_id: string | null;
  open_attempt: { id: string; kind: AttemptKind; checkpoint: Checkpoint | null } | null;
  revisit: {
    eligible: boolean;
    source_dashboard_id: string | null;
    source_title: string | null;
    learning_module_id: string | null;
  };
}

export interface AnchorAttempt {
  id: string;
  user_id: string;
  kind: AttemptKind;
  checkpoint: Checkpoint | null;
  learning_module_id: string | null;
  source_dashboard_id: string | null;
  sessions_at_start: number;
  started_at: string;
  completed_at: string | null;
}

/** The learner's live session counts (total and by area) and what is due. */
export async function fetchCheckpointStatus(client: SupabaseClient): Promise<CheckpointStatus | null> {
  const { data, error } = await client.rpc('my_checkpoint_status');
  if (error) throw error;
  return (data as CheckpointStatus | null) ?? null;
}

/** Begin (or resume) an attempt. Throws if the database says it is not due. */
export async function startAnchorAttempt(client: SupabaseClient, kind: AttemptKind): Promise<AnchorAttempt> {
  const { data, error } = await client.rpc('start_anchor_attempt', { p_kind: kind });
  if (error) throw error;
  return data as AnchorAttempt;
}

/** Link the dashboard row the learner worked in and keep a transcript snapshot. */
export async function finishAnchorAttempt(
  client: SupabaseClient,
  attemptId: string,
  dashboardId: string,
  transcript: unknown[],
): Promise<void> {
  const { error } = await client.rpc('finish_anchor_attempt', {
    p_attempt: attemptId,
    p_dashboard: dashboardId,
    p_transcript: transcript,
  });
  if (error) throw error;
}

export type NextPrompt =
  | { type: 'resume'; attemptId: string; kind: AttemptKind }
  | { type: 'revisit'; sourceTitle: string | null }
  | { type: 'checkpoint'; checkpoint: Checkpoint }
  | null;

/**
 * What to offer the learner right now. An unfinished attempt comes first, then
 * the one-time revisit of their first AI Learning session, then a due
 * checkpoint. Returns null for staff, or when nothing is due.
 */
export function nextPrompt(status: CheckpointStatus | null): NextPrompt {
  if (!status || !status.eligible_learner) return null;
  if (status.open_attempt) {
    return { type: 'resume', attemptId: status.open_attempt.id, kind: status.open_attempt.kind };
  }
  if (status.revisit.eligible) {
    return { type: 'revisit', sourceTitle: status.revisit.source_title };
  }
  if (status.due_checkpoint !== null && status.anchor_module_id) {
    return { type: 'checkpoint', checkpoint: status.due_checkpoint };
  }
  return null;
}
