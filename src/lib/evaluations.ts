// src/lib/evaluations.ts
// Client for the shared `evaluations` table — one rubric-evaluation row per
// dashboard entry, upserted in place each time an activity is re-evaluated.
// See supabase/migrations/20260815033105_create_evaluations.sql.
import { supabase } from './supabaseClient';

export interface EvaluationCriterion {
  key: string;
  label: string;
  score: number;
  maxScore?: number;   // defaults to the evaluation's maxScore
  evidence?: string;
}

export interface EvaluationRecord {
  dashboardId: string;
  activityType: string;
  overallScore: number;
  maxScore?: number;    // defaults to 3
  evidence?: string | null;
  criteria: EvaluationCriterion[];
}

export async function saveEvaluation(userId: string, record: EvaluationRecord): Promise<void> {
  const { error } = await supabase
    .from('evaluations')
    .upsert(
      {
        user_id: userId,
        dashboard_id: record.dashboardId,
        activity_type: record.activityType,
        overall_score: record.overallScore,
        max_score: record.maxScore ?? 3,
        evidence: record.evidence ?? null,
        criteria: record.criteria,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'dashboard_id' }
    );

  if (error) throw error;
}

export async function loadEvaluation(dashboardId: string): Promise<EvaluationRecord | null> {
  const { data, error } = await supabase
    .from('evaluations')
    .select('dashboard_id, activity_type, overall_score, max_score, evidence, criteria')
    .eq('dashboard_id', dashboardId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    dashboardId: data.dashboard_id,
    activityType: data.activity_type,
    overallScore: data.overall_score,
    maxScore: data.max_score,
    evidence: data.evidence,
    criteria: data.criteria ?? [],
  };
}
