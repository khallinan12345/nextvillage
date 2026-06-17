export type ProficiencyBand = 'Emerging' | 'Developing' | 'Proficient' | 'Advanced';

export const PROFICIENCY_BANDS: ProficiencyBand[] = [
  'Emerging',
  'Developing',
  'Proficient',
  'Advanced',
];

export const LEVEL_RANK: Record<ProficiencyBand, number> = {
  Emerging: 1,
  Developing: 2,
  Proficient: 3,
  Advanced: 4,
};

export const PROFICIENCY_COLORS: Record<
  ProficiencyBand,
  { bar: string; text: string; bg: string; border: string }
> = {
  Emerging:   { bar: 'bg-slate-400',  text: 'text-slate-700',  bg: 'bg-slate-50',  border: 'border-slate-200' },
  Developing: { bar: 'bg-amber-400',  text: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  Proficient: { bar: 'bg-blue-500',   text: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  Advanced:   { bar: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
};

function parseEvalField(raw: unknown): { overall_level?: string } | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  if (typeof raw === 'object') return raw as { overall_level?: string };
  return null;
}

function scoreToBand(score: number | null | undefined): ProficiencyBand | null {
  if (score == null) return null;
  if (score >= 3) return 'Advanced';
  if (score >= 2) return 'Proficient';
  if (score >= 1) return 'Emerging';
  return null;
}

export function maxProficiencyFromRow(row: Record<string, unknown>): ProficiencyBand | null {
  let best: ProficiencyBand | null = null;

  for (const key of ['science_skills_evaluation', 'math_skills_evaluation', 'english_skills_evaluation']) {
    const ev = parseEvalField(row[key]);
    const level = ev?.overall_level as ProficiencyBand | undefined;
    if (level && LEVEL_RANK[level] && (!best || LEVEL_RANK[level] > LEVEL_RANK[best])) {
      best = level;
    }
  }

  const certScore = row.certification_evaluation_score as number | null | undefined;
  const certBand = scoreToBand(certScore);
  if (certBand && (!best || LEVEL_RANK[certBand] > LEVEL_RANK[best])) {
    best = certBand;
  }

  return best;
}

export function completionRateToBand(rate: number): ProficiencyBand {
  if (rate >= 80) return 'Advanced';
  if (rate >= 60) return 'Proficient';
  if (rate >= 30) return 'Developing';
  return 'Emerging';
}

export function cohortProficiencyCounts(
  learnerIds: string[],
  rows: { user_id: string; [key: string]: unknown }[],
  completionRates?: Map<string, number>,
): Record<ProficiencyBand, number> {
  const counts: Record<ProficiencyBand, number> = {
    Emerging: 0,
    Developing: 0,
    Proficient: 0,
    Advanced: 0,
  };

  for (const id of learnerIds) {
    const learnerRows = rows.filter(r => r.user_id === id);
    let best: ProficiencyBand | null = null;
    for (const row of learnerRows) {
      const level = maxProficiencyFromRow(row);
      if (level && (!best || LEVEL_RANK[level] > LEVEL_RANK[best])) {
        best = level;
      }
    }
    if (!best && completionRates?.has(id)) {
      best = completionRateToBand(completionRates.get(id)!);
    }
    if (!best) best = 'Emerging';
    counts[best]++;
  }

  return counts;
}
