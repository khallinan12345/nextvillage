// EvaluationPanel.tsx - shared rubric-evaluation display.
// Renders any activity's evaluation (overall score + per-criterion
// breakdown) from the generic shape stored in the `evaluations` table
// (see src/lib/evaluations.ts). Semantic red/amber/blue/green stay
// reserved for score tiers, scaled to whatever max_score a criterion
// uses — everything else uses the paper/surface/card/hair/ink/body/muted
// token system from the nextVillage chat aesthetics protocol.
import React from 'react';
import classNames from 'classnames';
import type { EvaluationCriterion } from '../../lib/evaluations';

const tierForRatio = (ratio: number): { chip: string; label: string } => {
  if (ratio >= 1)     return { chip: 'bg-green-100 text-green-800 border-green-300',   label: 'Advanced' };
  if (ratio >= 0.67)  return { chip: 'bg-blue-100 text-blue-800 border-blue-300',      label: 'Proficient' };
  if (ratio >= 0.33)  return { chip: 'bg-yellow-100 text-yellow-800 border-yellow-300', label: 'Emerging' };
  return                     { chip: 'bg-red-100 text-red-800 border-red-300',          label: 'No Evidence' };
};

interface EvaluationPanelProps {
  overallScore: number;
  maxScore?: number;
  evidence?: string | null;
  criteria: EvaluationCriterion[];
  title?: string;
}

const EvaluationPanel: React.FC<EvaluationPanelProps> = ({
  overallScore,
  maxScore = 3,
  evidence,
  criteria,
  title = 'Evaluation',
}) => {
  const overallTier = tierForRatio(maxScore > 0 ? overallScore / maxScore : 0);

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-hair rounded-xl p-6 text-center">
        <div className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">{title}</div>
        <div className="text-6xl font-extrabold text-ink">
          {overallScore}<span className="text-3xl text-muted">/{maxScore}</span>
        </div>
        <div className={classNames('inline-block px-6 py-2.5 rounded-full text-xl font-bold mt-3 border', overallTier.chip)}>
          {overallTier.label}
        </div>
        {evidence && <p className="text-sm text-body mt-3 leading-relaxed">{evidence}</p>}
      </div>

      {criteria.length > 0 && (
        <div className="space-y-3">
          {criteria.map(c => {
            const max = c.maxScore ?? maxScore;
            const tier = tierForRatio(max > 0 ? c.score / max : 0);
            return (
              <div key={c.key} className="bg-paper rounded-lg p-4 border border-hair">
                <div className="flex items-center justify-between mb-1.5 gap-2">
                  <h5 className="font-semibold text-ink text-sm">{c.label}</h5>
                  <span className={classNames('px-2.5 py-0.5 rounded-full text-xs font-bold border flex-shrink-0', tier.chip)}>
                    {c.score}/{max} · {tier.label}
                  </span>
                </div>
                {c.evidence && (
                  <p className="text-sm text-body">
                    <span className="font-medium text-ink">Evidence:</span> {c.evidence}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EvaluationPanel;
