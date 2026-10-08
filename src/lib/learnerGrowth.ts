import type { SupabaseClient } from '@supabase/supabase-js';

// Per-learner change view for facilitators and researchers. The data comes from
// get_learner_growth(), which only answers for admins, research leads, site
// leaders and leaders (each limited to their own site). Everything here is
// "this learner now compared with this learner at the start"; it never ranks
// learners against each other.

export type Area = 'learning' | 'foundational' | 'tech_skills' | 'community_impact' | 'ai_playground' | 'unmapped';

export const AREA_LABELS: Record<Area, string> = {
  learning: 'Learning',
  foundational: 'Foundational',
  tech_skills: 'Tech skills',
  community_impact: 'Community impact',
  ai_playground: 'AI Playground',
  unmapped: 'Other',
};

export const SKILLS = [
  { key: 'cognitive', label: 'Cognitive' },
  { key: 'critical_thinking', label: 'Critical thinking' },
  { key: 'problem_solving', label: 'Problem solving' },
  { key: 'creativity', label: 'Creativity' },
] as const;

export type SkillKey = (typeof SKILLS)[number]['key'];

export interface Assessment {
  month: string;
  cognitive: number | null;
  critical_thinking: number | null;
  problem_solving: number | null;
  creativity: number | null;
  clarifications: number | null;
}

export type FourScores = Partial<Record<SkillKey, number | null>>;

export interface LearnerGrowth {
  learner_id: string;
  name: string | null;
  organization: string | null;
  first_session_at: string | null;
  total_sessions: number;
  by_area: Partial<Record<Area, number>>;
  early_mix: Partial<Record<Area, number>>;
  recent_mix: Partial<Record<Area, number>> | null;
  assessed_months: number;
  first_assessment: Assessment | null;
  latest_assessment: Assessment | null;
  certifications: number;
  revisit: { original: FourScores | null; new: FourScores | null } | null;
  checkpoints: Record<string, number> | null;
}

export async function fetchLearnerGrowth(client: SupabaseClient): Promise<LearnerGrowth[]> {
  const { data, error } = await client.rpc('get_learner_growth');
  if (error) throw error;
  return (data as LearnerGrowth[] | null) ?? [];
}

/** Percent of sessions in each area, rounded; null when there is nothing to share out. */
export function areaShares(mix: Partial<Record<Area, number>> | null | undefined): Partial<Record<Area, number>> | null {
  if (!mix) return null;
  const total = Object.values(mix).reduce<number>((s, n) => s + (n ?? 0), 0);
  if (total <= 0) return null;
  const out: Partial<Record<Area, number>> = {};
  for (const [area, n] of Object.entries(mix)) out[area as Area] = Math.round(((n ?? 0) / total) * 100);
  return out;
}

/** Latest minus first, to one decimal; null if either is missing. */
export function change(first: number | null | undefined, latest: number | null | undefined): number | null {
  if (first == null || latest == null) return null;
  return Math.round((Number(latest) - Number(first)) * 10) / 10;
}

/** "▲ +8.2", "▼ −3.1", "no change", or "–" when it cannot be worked out. Words and arrows, not colour alone. */
export function describeChange(delta: number | null): string {
  if (delta === null) return '–';
  if (delta === 0) return 'no change';
  const sign = delta > 0 ? '+' : '−';
  const arrow = delta > 0 ? '▲' : '▼';
  return `${arrow} ${sign}${Math.abs(delta)}`;
}

/** Mean of the scores that exist; null if none. */
export function composite(scores: FourScores | null | undefined): number | null {
  if (!scores) return null;
  const v = SKILLS.map((s) => scores[s.key]).filter((x): x is number => x != null);
  if (v.length === 0) return null;
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10;
}

/** First-to-latest comparison only means something with two or more assessed months. */
export function hasProgression(l: Pick<LearnerGrowth, 'assessed_months'>): boolean {
  return l.assessed_months >= 2;
}

/** Skill changes between the first and latest assessment, in a fixed order. */
export function skillChanges(l: LearnerGrowth): { key: SkillKey; label: string; first: number | null; latest: number | null; delta: number | null }[] {
  return SKILLS.map(({ key, label }) => {
    const first = l.first_assessment?.[key] ?? null;
    const latest = l.latest_assessment?.[key] ?? null;
    return { key, label, first, latest, delta: hasProgression(l) ? change(first, latest) : null };
  });
}
