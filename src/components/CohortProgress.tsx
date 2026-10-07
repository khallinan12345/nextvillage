import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

// Cohort lines: the same learners followed from the month of their first
// session. Data comes from get_cohort_progress() (staff excluded, cohorts
// under 3 learners suppressed by the database).

interface CohortRow {
  cohort_month: string;
  month_index: number;
  cohort_size: number;
  active_learners: number | null;
  avg_certs: number | null;
}

const MIN_COHORT = 10; // smaller cohorts are too noisy to draw as a line
const COLORS = ['#fbbf24', '#4ade80', '#38bdf8', '#c084fc', '#f87171', '#fb923c'];
const W = 320, H = 170, PAD = { l: 34, r: 10, t: 10, b: 26 };

function monthLabel(d: string) {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

function LineChart({ title, series, maxX, yMax, fmt }: {
  title: string;
  series: { label: string; color: string; pts: { x: number; y: number }[] }[];
  maxX: number; yMax: number; fmt: (v: number) => string;
}) {
  const sx = (x: number) => PAD.l + (x / Math.max(maxX, 1)) * (W - PAD.l - PAD.r);
  const sy = (y: number) => H - PAD.b - (y / yMax) * (H - PAD.t - PAD.b);
  const ticks = [0, 0.5, 1].map(f => f * yMax);
  return (
    <div style={{ flex: '1 1 300px', minWidth: 0 }}>
      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#fff', marginBottom: 4 }}>{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label={title}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} stroke="rgba(255,255,255,0.08)" />
            <text x={PAD.l - 4} y={sy(t) + 3} fontSize="9" fill="rgba(255,255,255,0.45)" textAnchor="end">{fmt(t)}</text>
          </g>
        ))}
        {Array.from({ length: maxX + 1 }, (_, i) => i).map(i => (
          <text key={i} x={sx(i)} y={H - 10} fontSize="9" fill="rgba(255,255,255,0.45)" textAnchor="middle">{i}</text>
        ))}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 0} fontSize="8" fill="rgba(255,255,255,0.35)" textAnchor="middle">months since first session</text>
        {series.map(s => (
          <g key={s.label}>
            <polyline fill="none" stroke={s.color} strokeWidth="2"
              points={s.pts.map(p => `${sx(p.x)},${sy(p.y)}`).join(' ')} />
            {s.pts.map(p => <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r="2.2" fill={s.color} />)}
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function CohortProgress() {
  const [rows, setRows] = useState<CohortRow[] | null>(null);

  useEffect(() => {
    supabase.rpc('get_cohort_progress').then(({ data, error }) => {
      if (error) { console.error('[CohortProgress]', error.message); return; }
      setRows((data as CohortRow[]) ?? []);
    });
  }, []);

  if (!rows) return null;

  const now = new Date();
  const thisMonth = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const monthNum = (d: string) => { const x = new Date(d + 'T00:00:00Z'); return x.getUTCFullYear() * 12 + x.getUTCMonth(); };

  // Drop the current (incomplete) month and cohorts too small to draw.
  const usable = rows.filter(r => r.cohort_size >= MIN_COHORT && monthNum(r.cohort_month) + r.month_index < thisMonth);
  const cohorts = [...new Set(usable.map(r => r.cohort_month))].sort();
  if (cohorts.length === 0) return null;

  const build = (pick: (r: CohortRow) => number | null) =>
    cohorts.map((c, i) => ({
      label: `${monthLabel(c)} (n=${usable.find(r => r.cohort_month === c)!.cohort_size})`,
      color: COLORS[i % COLORS.length],
      pts: usable.filter(r => r.cohort_month === c)
        .map(r => ({ x: r.month_index, y: pick(r) }))
        .filter((p): p is { x: number; y: number } => p.y != null),
    }));

  const retention = build(r => r.active_learners == null ? null : (100 * r.active_learners) / r.cohort_size);
  const certs = build(r => r.avg_certs);
  const maxX = Math.max(...usable.map(r => r.month_index));
  const certMax = Math.max(1, Math.ceil(Math.max(...certs.flatMap(s => s.pts.map(p => p.y)), 0) * 10) / 10);

  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <div style={{ fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4ade80', marginBottom: 6 }}>
        Cohorts by month of first session
      </div>
      <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginBottom: 12, lineHeight: 1.6 }}>
        Each line follows the same learners from the month they started. Cohorts with fewer than {MIN_COHORT} learners are not drawn.
        Certifications were introduced in March 2026, so earlier cohorts could only earn them later in their journey.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem' }}>
        <LineChart title="Learners active (% of cohort)" series={retention} maxX={maxX} yMax={100} fmt={v => `${Math.round(v)}%`} />
        <LineChart title="Formal certifications per learner (cumulative)" series={certs} maxX={maxX} yMax={certMax} fmt={v => v.toFixed(1)} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem', marginTop: 8, fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)' }}>
        {retention.map(s => (
          <span key={s.label}><span style={{ display: 'inline-block', width: 10, height: 3, background: s.color, marginRight: 5, verticalAlign: 'middle' }} />{s.label}</span>
        ))}
      </div>
    </div>
  );
}
