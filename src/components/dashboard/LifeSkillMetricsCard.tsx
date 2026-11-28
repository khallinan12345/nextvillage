// src/components/dashboard/LifeSkillMetricsCard.tsx
//
// Two kinds of "growth" for the signed-in learner, shown on their own
// Dashboard:
//   - behavioral/longitudinal: Grit, Independence, Feedback-responsiveness,
//     Uphold Community Standards — from my_life_skill_metrics() (see
//     20261125150000_life_skill_metrics.sql). Nothing here is backfilled, so
//     a new learner (or one who hasn't retried a hard topic, used a hint, or
//     had a weakest area come up twice yet) will correctly see "Not enough
//     data yet" rather than a misleading 0%.
//   - current measured level: Critical Thinking, Problem-Solving, Creativity,
//     Communication — the Skills Development rubric dimensions, from
//     my_skills_profile() (see 20261126120000_my_skills_profile.sql). This is
//     a point-in-time score, not a behavior, so it's shown as its own
//     labelled group rather than mixed in with the first four.

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

type SkillsProfile = Partial<Record<'Critical Thinking' | 'Problem-Solving' | 'Creativity' | 'Communication', number>>;

const METRIC_TILES: { key: keyof Metrics; label: string; sublabel: string; color: string }[] = [
  { key: 'grit', label: 'Grit', sublabel: 'Trying again after a hard topic', color: '#ea580c' },
  { key: 'independence', label: 'Independence', sublabel: 'Working it out before asking for a hint', color: '#059669' },
  { key: 'feedback_responsiveness', label: 'Acting on feedback', sublabel: 'Improving on last time’s weakest spot', color: '#0284c7' },
  { key: 'uphold_community_standards', label: 'Community standards', sublabel: 'Keeping shared spaces safe and kind', color: '#7c3aed' },
];

const SKILL_TILES: { key: keyof SkillsProfile; sublabel: string; color: string }[] = [
  { key: 'Critical Thinking', sublabel: 'Your latest measured level', color: '#dc2626' },
  { key: 'Problem-Solving', sublabel: 'Your latest measured level', color: '#d97706' },
  { key: 'Creativity', sublabel: 'Your latest measured level', color: '#db2777' },
  { key: 'Communication', sublabel: 'Your latest measured level', color: '#0891b2' },
];

const Tile: React.FC<{ label: string; sublabel: string; color: string; value: number | null | undefined }> = ({ label, sublabel, color, value }) =>
  value === null || value === undefined ? (
    <div className="flex flex-col items-center text-center">
      <div
        className="flex items-center justify-center rounded-full border-2 border-dashed border-gray-200 text-xs text-gray-400"
        style={{ width: 112, height: 112 }}
      >
        Not enough<br />data yet
      </div>
      <p className="mt-2 text-sm font-semibold text-gray-800 text-center">{label}</p>
      <p className="text-xs text-gray-500 text-center mt-0.5">{sublabel}</p>
    </div>
  ) : (
    <CircularProgressRing percentage={Math.round(value * 100)} label={label} sublabel={sublabel} progressColor={color} />
  );

const LifeSkillMetricsCard: React.FC = () => {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [skills, setSkills] = useState<SkillsProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.rpc('my_life_skill_metrics'),
      supabase.rpc('my_skills_profile'),
    ]).then(([metricsRes, skillsRes]) => {
      if (cancelled) return;
      if (metricsRes.error) console.warn('[LifeSkillMetricsCard] my_life_skill_metrics failed:', metricsRes.error);
      else setMetrics(metricsRes.data as Metrics);
      if (skillsRes.error) console.warn('[LifeSkillMetricsCard] my_skills_profile failed:', skillsRes.error);
      else setSkills(skillsRes.data as SkillsProfile);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (loading) return null;
  if (!metrics && !skills) return null;

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

      {metrics && (
        <div className="p-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {METRIC_TILES.map(tile => (
            <Tile key={tile.key} label={tile.label} sublabel={tile.sublabel} color={tile.color} value={metrics[tile.key]} />
          ))}
        </div>
      )}

      {skills && (
        <div className="px-5 pb-5 pt-1 border-t border-gray-100">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3 mt-3">Current skill levels</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {SKILL_TILES.map(tile => (
              <Tile key={tile.key} label={tile.key} sublabel={tile.sublabel} color={tile.color} value={skills[tile.key]} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LifeSkillMetricsCard;
