// src/components/dashboard/LifeSkillMetricsCard.tsx
//
// Four computed life-skill metrics for the signed-in learner, shown on their
// own Dashboard: Grit, Independence, Feedback-responsiveness, Uphold
// Community Standards. Pulled from my_life_skill_metrics() (see
// 20261125150000_life_skill_metrics.sql) — nothing here is backfilled, so a
// new learner (or one who hasn't retried a hard topic, used a hint, or had a
// weakest area come up twice yet) will correctly see "Not enough data yet"
// rather than a misleading 0%.

import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import CircularProgressRing from '../ui/CircularProgressRing';

interface Metrics {
  grit: number | null;
  independence: number | null;
  feedback_responsiveness: number | null;
  uphold_community_standards: number | null;
}

const TILES: { key: keyof Metrics; label: string; sublabel: string; color: string }[] = [
  { key: 'grit', label: 'Grit', sublabel: 'Trying again after a hard topic', color: '#ea580c' },
  { key: 'independence', label: 'Independence', sublabel: 'Working it out before asking for a hint', color: '#059669' },
  { key: 'feedback_responsiveness', label: 'Acting on feedback', sublabel: 'Improving on last time’s weakest spot', color: '#0284c7' },
  { key: 'uphold_community_standards', label: 'Community standards', sublabel: 'Keeping shared spaces safe and kind', color: '#7c3aed' },
];

const LifeSkillMetricsCard: React.FC = () => {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc('my_life_skill_metrics').then(({ data, error }) => {
      if (cancelled) return;
      if (error) { console.warn('[LifeSkillMetricsCard] load failed:', error); setLoading(false); return; }
      setMetrics(data as Metrics);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (loading) return null;
  if (!metrics) return null;

  return (
    <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b bg-linear-to-r from-indigo-50 to-purple-50">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Sparkles size={20} className="text-indigo-600" />
          Your growth
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Built up from how you actually learn — not backfilled, so this fills in over time.
        </p>
      </div>
      <div className="p-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {TILES.map(tile => {
          const value = metrics[tile.key];
          return value === null ? (
            <div key={tile.key} className="flex flex-col items-center text-center">
              <div
                className="flex items-center justify-center rounded-full border-2 border-dashed border-gray-200 text-xs text-gray-400"
                style={{ width: 112, height: 112 }}
              >
                Not enough<br />data yet
              </div>
              <p className="mt-2 text-sm font-semibold text-gray-800 text-center">{tile.label}</p>
              <p className="text-xs text-gray-500 text-center mt-0.5">{tile.sublabel}</p>
            </div>
          ) : (
            <CircularProgressRing
              key={tile.key}
              percentage={Math.round(value * 100)}
              label={tile.label}
              sublabel={tile.sublabel}
              progressColor={tile.color}
            />
          );
        })}
      </div>
    </div>
  );
};

export default LifeSkillMetricsCard;
