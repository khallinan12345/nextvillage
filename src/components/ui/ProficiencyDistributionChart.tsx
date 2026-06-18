import React from 'react';
import { BarChart2 } from 'lucide-react';
import classNames from 'classnames';
import {
  PROFICIENCY_BANDS,
  PROFICIENCY_COLORS,
  type ProficiencyBand,
} from '../../utils/proficiencyHelpers';

interface ProficiencyDistributionChartProps {
  counts: Record<ProficiencyBand, number>;
  totalLearners: number;
  className?: string;
}

const ProficiencyDistributionChart: React.FC<ProficiencyDistributionChartProps> = ({
  counts,
  totalLearners,
  className,
}) => {
  const total = totalLearners > 0 ? totalLearners : PROFICIENCY_BANDS.reduce((s, b) => s + counts[b], 0);

  return (
    <div className={classNames('px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50/60 to-purple-50/60', className)}>
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 size={15} className="text-purple-600" />
        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
          Proficiency Distribution
        </h3>
        <span className="text-xs text-gray-400 ml-auto">{total} learners</span>
      </div>

      {total === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">No learner data to chart yet.</p>
      ) : (
        <>
          <div className="flex h-7 rounded-full overflow-hidden bg-gray-200 shadow-inner">
            {PROFICIENCY_BANDS.map(band => {
              const count = counts[band];
              const pct = (count / total) * 100;
              if (pct <= 0) return null;
              return (
                <div
                  key={band}
                  className={classNames('h-full transition-all', PROFICIENCY_COLORS[band].bar)}
                  style={{ width: `${pct}%` }}
                  title={`${band}: ${count} (${pct.toFixed(0)}%)`}
                />
              );
            })}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5">
            {PROFICIENCY_BANDS.map(band => {
              const count = counts[band];
              const pct = total > 0 ? ((count / total) * 100).toFixed(0) : '0';
              const colors = PROFICIENCY_COLORS[band];
              return (
                <span
                  key={band}
                  className={classNames(
                    'inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border',
                    colors.bg,
                    colors.text,
                    colors.border,
                  )}
                >
                  <span className={classNames('inline-block w-2 h-2 rounded-full', colors.bar)} />
                  {band}: {count} ({pct}%)
                </span>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default ProficiencyDistributionChart;
