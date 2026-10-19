// Helpers for the organization progress report page (see get_org_progress_report in the database).
// Mirrors api/_lib/orgProgressReport.js, which formats the same scores for email.

export const DIMENSIONS: [key: ScoreKey, label: string][] = [
  ['cognitive', 'Understanding'],
  ['critical_thinking', 'Critical thinking'],
  ['problem_solving', 'Problem solving'],
  ['creativity', 'Creativity'],
];

export type ScoreKey = 'cognitive' | 'critical_thinking' | 'problem_solving' | 'creativity';

export interface MonthScores {
  cognitive: number | null;
  critical_thinking: number | null;
  problem_solving: number | null;
  creativity: number | null;
  sessions: number | null;
}

export interface ReportLearner {
  name: string | null;
  current: MonthScores | null;
  previous: MonthScores | null;
}

export interface OrgProgressReport {
  org: string | null;
  month: string;
  learners: ReportLearner[];
}

/** A change smaller than this is "steady": scores are AI estimates and wobble from month to month. */
export const STEADY_BAND = 5;

export type Trend = 'up' | 'down' | 'steady' | null;

export function trend(now: number | null | undefined, before: number | null | undefined): Trend {
  if (now == null || before == null) return null;
  const d = Number(now) - Number(before);
  if (d >= STEADY_BAND) return 'up';
  if (d <= -STEADY_BAND) return 'down';
  return 'steady';
}

/** Below 10 the scale cannot tell "a little" from "nothing", so show "<10" rather than a bare 0. */
export function showScore(v: number | null | undefined): string {
  if (v == null) return '–';
  const n = Number(v);
  return n < 10 ? '<10' : String(Math.round(n));
}

/** A learner counts as scored when at least one of the four scores exists. */
export function hasScores(s: MonthScores | null): s is MonthScores {
  return !!s && DIMENSIONS.some(([k]) => s[k] != null);
}
