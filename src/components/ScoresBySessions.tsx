import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

// "When learners stick, they grow": average monthly skill scores of learners who have reached
// 100 sessions, by how many sessions they had done when scored. Data comes from
// get_scores_by_session_range() (staff excluded, ranges under 5 learners suppressed by the database).

interface RangeRow {
  range_order: number;
  range_label: string;
  learners: number;
  learner_months: number;
  cognitive: number | null;
  critical_thinking: number | null;
  problem_solving: number | null;
  creativity: number | null;
  overall: number | null;
}

const SERIES: { key: keyof RangeRow; label: string; color: string }[] = [
  { key: 'cognitive', label: 'Cognitive', color: '#60a5fa' },
  { key: 'critical_thinking', label: 'Critical thinking', color: '#fb923c' },
  { key: 'problem_solving', label: 'Problem solving', color: '#4ade80' },
  { key: 'creativity', label: 'Creativity', color: '#fbbf24' },
];
const W = 640, H = 300, PAD = { l: 34, r: 12, t: 12, b: 48 };

export default function ScoresBySessions() {
  const [rows, setRows] = useState<RangeRow[] | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    supabase.rpc('get_scores_by_session_range').then(({ data, error }) => {
      if (error) { console.error('[ScoresBySessions]', error.message); return; }
      setRows((data as RangeRow[]) ?? []);
    });
  }, []);

  if (!rows) return null;
  const shown = rows.filter(r => r.overall != null);
  if (shown.length < 3) return null;

  const sx = (i: number) => PAD.l + ((W - PAD.l - PAD.r) * (i + 0.5)) / rows.length;
  const sy = (v: number) => H - PAD.b - (v / 100) * (H - PAD.t - PAD.b);
  const early = shown.filter(r => r.range_order <= 3), late = shown.filter(r => r.range_order >= 4);
  const avg = (a: RangeRow[]) => a.reduce((s, r) => s + (r.overall as number), 0) / a.length;
  const label = (l: string) => l.replace('-', '–');
  const h = hover != null ? rows[hover] : null;

  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <div style={{ fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4ade80', marginBottom: 6 }}>
        When learners stick, they grow
      </div>
      <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginBottom: 12, lineHeight: 1.6 }}>
        Average monthly skill scores (0–100) for learners who have reached 100 sessions, by how many sessions they had done when scored.
        Scores sit near {Math.round(avg(early))} through the first 100 sessions and near {Math.round(avg(late))} after.
        These are the learners who kept going, so this shows what happens when learners stick, not what to expect from everyone.
        Ranges with fewer than 5 learners are not shown.
      </div>
      <div style={{ position: 'relative', maxWidth: 720 }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img"
             aria-label="Average skill scores by number of sessions completed">
          {[0, 25, 50, 75, 100].map(t => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} stroke="rgba(255,255,255,0.08)" />
              <text x={PAD.l - 5} y={sy(t) + 3} fontSize="10" fill="rgba(255,255,255,0.45)" textAnchor="end">{t}</text>
            </g>
          ))}
          <line x1={PAD.l + ((W - PAD.l - PAD.r) * 3) / rows.length} x2={PAD.l + ((W - PAD.l - PAD.r) * 3) / rows.length}
                y1={PAD.t} y2={H - PAD.b} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 4" />
          {rows.map((r, i) => (
            <g key={r.range_order}>
              <text x={sx(i)} y={H - 28} fontSize="10" fill="rgba(255,255,255,0.55)" textAnchor="middle">{label(r.range_label)} sessions</text>
              <text x={sx(i)} y={H - 14} fontSize="9" fill="rgba(255,255,255,0.35)" textAnchor="middle">
                {r.overall != null ? `${r.learners} learners` : 'too few learners'}
              </text>
            </g>
          ))}
          {SERIES.map(s => {
            const pts = rows.map((r, i) => ({ i, v: r[s.key] as number | null })).filter((p): p is { i: number; v: number } => p.v != null);
            return (
              <g key={s.key as string}>
                <polyline fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
                          points={pts.map(p => `${sx(p.i)},${sy(p.v)}`).join(' ')} />
                {pts.map(p => <circle key={p.i} cx={sx(p.i)} cy={sy(p.v)} r="3.5" fill={s.color} stroke="#1a1a2e" strokeWidth="1.5" />)}
              </g>
            );
          })}
          {rows.map((r, i) => (
            <rect key={r.range_order} x={sx(i) - (W - PAD.l - PAD.r) / rows.length / 2} y={PAD.t}
                  width={(W - PAD.l - PAD.r) / rows.length} height={H - PAD.t - PAD.b} fill="transparent"
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === i ? null : i)} />
          ))}
        </svg>
        {h && h.overall != null && (
          <div style={{ position: 'absolute', top: 8, left: `${(sx(hover as number) / W) * 100}%`, transform: 'translateX(-50%)', pointerEvents: 'none',
                        background: 'rgba(15,15,30,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '6px 9px',
                        fontSize: '0.72rem', lineHeight: 1.5, color: '#fff', whiteSpace: 'nowrap' }}>
            <b>{label(h.range_label)} sessions</b> · {h.learners} learners
            {SERIES.map(s => <div key={s.key as string}><span style={{ color: s.color }}>●</span> {s.label}: {Math.round(h[s.key] as number)}</div>)}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem', marginTop: 8, fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)' }}>
        {SERIES.map(s => (
          <span key={s.key as string}><span style={{ display: 'inline-block', width: 10, height: 3, background: s.color, marginRight: 5, verticalAlign: 'middle' }} />{s.label}</span>
        ))}
        <span>Dashed line: 100 sessions</span>
      </div>
    </div>
  );
}
