// src/components/viz/VizRenderer.tsx
//
// Deterministic SVG/HTML renderers for every picture the AI coach can ask for. The specs are
// validated in vizSpec.ts; this file only draws them. Original seven math pictures were moved
// here from MathViz.tsx unchanged; line charts, interactive graphs, tables, cycles and
// Mermaid diagrams are new.

import React, { Suspense, useId, useMemo, useState } from 'react';
import { PALETTE, SCENE_W, SCENE_H, type VizSpec } from './vizSpec';
import { compileExpr } from './expr';

const PALETTE_LIGHT = ['#eef2ff','#fffbeb','#ecfdf5','#fff1f2','#e0f2fe','#f5f3ff','#fff7ed','#f0fdfa'];
const PALETTE_MID   = ['#818cf8','#fcd34d','#34d399','#fb7185','#38bdf8','#a78bfa','#fb923c','#2dd4bf'];

const MermaidDiagram = React.lazy(() => import('./MermaidDiagram'));

// ─── Renderers ────────────────────────────────────────────────────────────────
// ─── Renderers ────────────────────────────────────────────────────────────────

const Frame: React.FC<{ label?: string; children: React.ReactNode; color?: number }> = ({ label, children, color = 0 }) => {
  const c = color % PALETTE.length;
  return (
    <div
      className="my-2 rounded-xl p-3 shadow-xs"
      style={{ background: PALETTE_LIGHT[c], border: `2px solid ${PALETTE_MID[c]}` }}
    >
      {label && (
        <p className="text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: PALETTE[c] }}>
          {label}
        </p>
      )}
      {children}
    </div>
  );
};

// ── Counters ─────────────────────────────────────────────────────────────────

const Counters: React.FC<{ spec: Extract<VizSpec, { type: 'counters' }> }> = ({ spec }) => (
  <Frame color={0}>
    <div className="flex flex-wrap gap-4">
      {spec.groups.map((g, i) => (
        <div
          key={i}
          className="rounded-xl px-3 py-2 shadow-xs"
          style={{ background: PALETTE_LIGHT[i % PALETTE.length], border: `2px solid ${PALETTE_MID[i % PALETTE.length]}` }}
        >
          <div className="flex flex-wrap gap-1 max-w-[220px] text-2xl leading-none">
            {Array.from({ length: g.count }).map((_, j) => <span key={j}>{g.emoji}</span>)}
          </div>
          <p className="text-center text-sm font-bold mt-1.5" style={{ color: PALETTE[i % PALETTE.length] }}>
            {g.count}{g.label ? ` ${g.label}` : ''}
          </p>
        </div>
      ))}
    </div>
  </Frame>
);

// ── Number Line ───────────────────────────────────────────────────────────────

const NumberLine: React.FC<{ spec: Extract<VizSpec, { type: 'number-line' }> }> = ({ spec }) => {
  const W = 560, H = spec.jump ? 112 : 72, PAD = 32, y = H - 30;
  const { min = 0, max } = spec;
  const x = (v: number) => PAD + ((v - min) / (max - min)) * (W - 2 * PAD);
  const range = max - min;
  const step = spec.step && spec.step > 0 ? spec.step
    : range <= 20 ? 1 : range <= 100 ? 10 : Math.pow(10, Math.floor(Math.log10(range / 10)) + 1);
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v);

  return (
    <Frame color={4}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl" role="img" aria-label="number line">
        {/* track */}
        <line x1={PAD - 10} y1={y} x2={W - PAD + 10} y2={y} stroke={PALETTE[4]} strokeWidth="3" strokeLinecap="round" />
        <polygon points={`${W - PAD + 12},${y} ${W - PAD + 2},${y - 5} ${W - PAD + 2},${y + 5}`} fill={PALETTE[4]} />
        {ticks.map(v => (
          <g key={v}>
            <line x1={x(v)} y1={y - 6} x2={x(v)} y2={y + 6} stroke={PALETTE[4]} strokeWidth="2" />
            <text x={x(v)} y={y + 20} textAnchor="middle" fontSize="12" fontWeight="600" fill="#1e3a5f">{v}</text>
          </g>
        ))}
        {spec.jump && (() => {
          const x1 = x(spec.jump!.from), x2 = x(spec.jump!.to), mid = (x1 + x2) / 2;
          const dir = x2 > x1 ? 1 : -1;
          return (
            <g>
              <path d={`M ${x1} ${y - 8} Q ${mid} ${y - 60} ${x2} ${y - 8}`}
                fill="none" stroke={PALETTE[1]} strokeWidth="3" strokeLinecap="round" />
              <polygon points={`${x2},${y - 8} ${x2 - dir * 9},${y - 19} ${x2 - dir * 3},${y - 5}`} fill={PALETTE[1]} />
              {spec.jump!.label && (
                <text x={mid} y={y - 54} textAnchor="middle" fontSize="14" fontWeight="bold" fill={PALETTE[1]}>
                  {spec.jump!.label}
                </text>
              )}
              <circle cx={x1} cy={y} r="7" fill={PALETTE[2]} stroke="white" strokeWidth="2" />
              <circle cx={x2} cy={y} r="7" fill={PALETTE[3]} stroke="white" strokeWidth="2" />
            </g>
          );
        })()}
        {(spec.points ?? []).map((v, i) => (
          <circle key={i} cx={x(v)} cy={y} r="7" fill={PALETTE[i % PALETTE.length]} stroke="white" strokeWidth="2" />
        ))}
      </svg>
    </Frame>
  );
};

// ── Tape / Bar Model ──────────────────────────────────────────────────────────

const Tape: React.FC<{ spec: Extract<VizSpec, { type: 'tape' }> }> = ({ spec }) => {
  const W = 560, barH = 48, PAD = 4;
  const total = spec.parts.reduce((s, p) => s + p.value, 0) || 1;
  const H = spec.total !== undefined ? barH + 44 : barH + 8;
  let cursor = PAD;
  return (
    <Frame label={spec.label} color={0}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl" role="img" aria-label="bar model">
        {spec.parts.map((p, i) => {
          const w = (p.value / total) * (W - 2 * PAD);
          const xStart = cursor; cursor += w;
          return (
            <g key={i}>
              <rect x={xStart} y={4} width={w} height={barH} rx="8" fill={p.color} stroke="white" strokeWidth="2.5" />
              <rect x={xStart} y={4} width={w * 0.4} height={barH} rx="8" fill="white" opacity="0.15" />
              {w > 34 && (
                <text x={xStart + w / 2} y={4 + barH / 2 + 6} textAnchor="middle" fontSize="15" fontWeight="bold" fill="white">
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
        {spec.total !== undefined && (
          <g>
            <path d={`M ${PAD} ${barH + 16} L ${PAD} ${barH + 26} L ${W - PAD} ${barH + 26} L ${W - PAD} ${barH + 16}`}
              fill="none" stroke={PALETTE[0]} strokeWidth="2" />
            <rect x={W / 2 - 36} y={barH + 16} width="72" height="24" rx="6" fill={PALETTE[0]} />
            <text x={W / 2} y={barH + 33} textAnchor="middle" fontSize="14" fontWeight="bold" fill="white">
              {spec.total}
            </text>
          </g>
        )}
      </svg>
    </Frame>
  );
};

// ── Dot Array ─────────────────────────────────────────────────────────────────

const DotArray: React.FC<{ spec: Extract<VizSpec, { type: 'array' }> }> = ({ spec }) => {
  const cell = 32, PAD = 8;
  const W = spec.cols * cell + 2 * PAD, H = spec.rows * cell + 2 * PAD;
  const ROW_COLORS = [PALETTE[0], PALETTE[2], PALETTE[1], PALETTE[5], PALETTE[4], PALETTE[3]];
  return (
    <Frame label={spec.label ?? `${spec.rows} × ${spec.cols} = ${spec.rows * spec.cols}`} color={0}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: W + 16 }} className="w-full" role="img" aria-label="multiplication array">
        {Array.from({ length: spec.rows }).flatMap((_, r) =>
          Array.from({ length: spec.cols }).map((_, c) => (
            <circle
              key={`${r}-${c}`}
              cx={PAD + c * cell + cell / 2}
              cy={PAD + r * cell + cell / 2}
              r={cell * 0.34}
              fill={ROW_COLORS[r % ROW_COLORS.length]}
            />
          ))
        )}
      </svg>
    </Frame>
  );
};

// ── Fraction Bar ──────────────────────────────────────────────────────────────

const FractionBar: React.FC<{ spec: Extract<VizSpec, { type: 'fraction-bar' }> }> = ({ spec }) => {
  const W = 560, H = 66, PAD = 4;
  const w = (W - 2 * PAD) / spec.parts;
  return (
    <Frame label={spec.label ?? `${spec.shaded} out of ${spec.parts} parts`} color={1}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl" role="img" aria-label="fraction bar">
        {Array.from({ length: spec.parts }).map((_, i) => {
          const isFirst = i === 0, isLast = i === spec.parts - 1;
          const shaded = i < spec.shaded;
          return (
            <g key={i}>
              <rect
                x={PAD + i * w} y={8} width={w} height={H - 16}
                rx={isFirst || isLast ? 8 : 0}
                fill={shaded ? PALETTE[1] : '#e2e8f0'}
                stroke="white" strokeWidth="2"
              />
              {shaded && w > 22 && (
                <text x={PAD + i * w + w / 2} y={8 + (H - 16) / 2 + 5}
                  textAnchor="middle" fontSize="13" fontWeight="bold" fill="white">
                  {i + 1}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </Frame>
  );
};

// ── Fraction Circle ───────────────────────────────────────────────────────────

const SECTOR_COLORS = [PALETTE[3], PALETTE[1], PALETTE[2], PALETTE[5], PALETTE[4], PALETTE[0]];

const FractionCircle: React.FC<{ spec: Extract<VizSpec, { type: 'fraction-circle' }> }> = ({ spec }) => {
  const R = 62, C = 72;
  const sector = (i: number) => {
    const a0 = (i / spec.parts) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 1) / spec.parts) * 2 * Math.PI - Math.PI / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M ${C} ${C} L ${C + R * Math.cos(a0)} ${C + R * Math.sin(a0)} A ${R} ${R} 0 ${large} 1 ${C + R * Math.cos(a1)} ${C + R * Math.sin(a1)} Z`;
  };
  return (
    <Frame label={spec.label ?? `${spec.shaded} out of ${spec.parts}`} color={3}>
      <svg viewBox="0 0 144 144" style={{ maxWidth: 180 }} className="w-full" role="img" aria-label="fraction circle">
        {spec.parts === 1
          ? <circle cx={C} cy={C} r={R} fill={spec.shaded ? SECTOR_COLORS[0] : '#e2e8f0'} stroke="white" strokeWidth="3" />
          : Array.from({ length: spec.parts }).map((_, i) => (
              <path
                key={i}
                d={sector(i)}
                fill={i < spec.shaded ? SECTOR_COLORS[i % SECTOR_COLORS.length] : '#e2e8f0'}
                stroke="white"
                strokeWidth="2.5"
              />
            ))}
      </svg>
    </Frame>
  );
};

// ── Bar Chart ─────────────────────────────────────────────────────────────────

const BarChart: React.FC<{ spec: Extract<VizSpec, { type: 'bar-chart' }> }> = ({ spec }) => {
  const W = 560, H = 200, LEFT = 38, PAD = 10, base = H - 36;
  const maxV = Math.max(...spec.bars.map(b => b.value), 1);
  const bw = (W - LEFT - PAD) / spec.bars.length;
  const gridLines = 4;
  return (
    <Frame label={spec.label} color={5}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl" role="img" aria-label="bar chart">
        {Array.from({ length: gridLines + 1 }).map((_, k) => {
          const gy = base - (k / gridLines) * (base - 20);
          const gv = Math.round((k / gridLines) * maxV);
          return (
            <g key={k}>
              <line x1={LEFT} y1={gy} x2={W - PAD} y2={gy} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 3" />
              <text x={LEFT - 4} y={gy + 4} textAnchor="end" fontSize="11" fill="#64748b">{gv}</text>
            </g>
          );
        })}
        <line x1={LEFT} y1={base} x2={W - PAD} y2={base} stroke="#475569" strokeWidth="2" />
        {spec.bars.map((b, i) => {
          const h = Math.max((b.value / maxV) * (base - 20), 4);
          const x0 = LEFT + i * bw + bw * 0.12;
          const bWidth = bw * 0.76;
          const color = PALETTE[i % PALETTE.length];
          return (
            <g key={i}>
              <rect x={x0} y={base - h} width={bWidth} height={h} rx="6" fill={color} />
              <rect x={x0} y={base - h} width={bWidth * 0.45} height={h} rx="6" fill="white" opacity="0.15" />
              {h > 22
                ? <text x={x0 + bWidth / 2} y={base - h + 16} textAnchor="middle" fontSize="13" fontWeight="bold" fill="white">{b.value}</text>
                : <text x={x0 + bWidth / 2} y={base - h - 5} textAnchor="middle" fontSize="13" fontWeight="bold" fill={color}>{b.value}</text>
              }
              <text x={x0 + bWidth / 2} y={base + 18} textAnchor="middle" fontSize="12" fontWeight="600" fill="#334155">{b.label}</text>
            </g>
          );
        })}
      </svg>
    </Frame>
  );
};

// ── Shared chart helpers ─────────────────────────────────────────────────────

function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * pow;
}
function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!(hi > lo)) return [lo];
  const step = niceStep((hi - lo) / count);
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}
const fmt = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${+(v / 1e6).toPrecision(3)}M`;
  if (a >= 1e4) return `${+(v / 1e3).toPrecision(3)}k`;
  return String(+v.toPrecision(4));
};
const shortLabel = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// ── Line / scatter chart ─────────────────────────────────────────────────────

const LineChart: React.FC<{ spec: Extract<VizSpec, { type: 'line-chart' }> }> = ({ spec }) => {
  const W = 560, H = 270, L = 52, R = 16, T = spec.series.length > 1 ? 30 : 16, B = spec.xLabel ? 56 : 40;
  const all = spec.series.flatMap(s => s.points);
  const categorical = all.some(p => typeof p[0] === 'string');
  const cats: string[] = [];
  if (categorical) for (const p of all) { const k = String(p[0]); if (!cats.includes(k)) cats.push(k); }
  const xsNum = all.map(p => Number(p[0]));
  const xLo = categorical ? 0 : Math.min(...xsNum), xHi = categorical ? Math.max(cats.length - 1, 1) : Math.max(...xsNum);
  const xSpan = xHi - xLo || 1;
  const ys = all.map(p => p[1]);
  const yMin = Math.min(0, ...ys), yMaxRaw = Math.max(...ys);
  const yTicks = niceTicks(yMin, yMaxRaw === yMin ? yMin + 1 : yMaxRaw, 5);
  const yLo = yTicks[0], yHi = yTicks[yTicks.length - 1] || 1;
  const px = (x: number | string) => {
    const v = categorical ? cats.indexOf(String(x)) : Number(x);
    return L + ((v - xLo) / xSpan) * (W - L - R);
  };
  const py = (y: number) => T + (1 - (y - yLo) / (yHi - yLo || 1)) * (H - T - B);
  const xTicks = categorical
    ? cats.map((c, i) => ({ v: i, label: shortLabel(c, 8) })).filter((_, i, a) => a.length <= 8 || i % Math.ceil(a.length / 8) === 0)
    : niceTicks(xLo, xHi, 6).map(v => ({ v, label: fmt(v) }));
  return (
    <Frame label={spec.label} color={5}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl" role="img" aria-label={spec.alt ?? 'chart'}>
        {yTicks.map(v => (
          <g key={v}>
            <line x1={L} y1={py(v)} x2={W - R} y2={py(v)} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 3" />
            <text x={L - 6} y={py(v) + 4} textAnchor="end" fontSize="11" fill="#64748b">{fmt(v)}</text>
          </g>
        ))}
        <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="#475569" strokeWidth="2" />
        <line x1={L} y1={T} x2={L} y2={H - B} stroke="#475569" strokeWidth="2" />
        {xTicks.map(t => (
          <text key={t.v} x={categorical ? px(cats[t.v]) : px(t.v)} y={H - B + 16} textAnchor="middle" fontSize="11" fill="#334155">{t.label}</text>
        ))}
        {spec.xLabel && <text x={(L + W - R) / 2} y={H - 8} textAnchor="middle" fontSize="12" fontWeight="600" fill="#334155">{spec.xLabel}</text>}
        {spec.yLabel && <text x={12} y={(T + H - B) / 2} textAnchor="middle" fontSize="12" fontWeight="600" fill="#334155" transform={`rotate(-90 12 ${(T + H - B) / 2})`}>{spec.yLabel}</text>}
        {spec.series.map((s, i) => {
          const color = PALETTE[(i + 4) % PALETTE.length];
          const pts = [...s.points].sort((a, b) => (categorical ? cats.indexOf(String(a[0])) - cats.indexOf(String(b[0])) : Number(a[0]) - Number(b[0])));
          return (
            <g key={i}>
              {spec.style === 'line' && pts.length > 1 && (
                <polyline fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"
                  points={pts.map(p => `${px(p[0])},${py(p[1])}`).join(' ')} />
              )}
              {pts.map((p, j) => <circle key={j} cx={px(p[0])} cy={py(p[1])} r={spec.style === 'scatter' ? 5 : 4} fill={color} stroke="white" strokeWidth="1.5" />)}
            </g>
          );
        })}
        {spec.series.length > 1 && spec.series.map((s, i) => (
          <g key={i} transform={`translate(${L + i * 120}, 10)`}>
            <rect width="12" height="12" rx="3" fill={PALETTE[(i + 4) % PALETTE.length]} />
            <text x="17" y="10" fontSize="11" fontWeight="600" fill="#334155">{shortLabel(s.name, 14)}</text>
          </g>
        ))}
      </svg>
    </Frame>
  );
};

// ── Interactive graph (sliders) ──────────────────────────────────────────────

const InteractiveGraph: React.FC<{ spec: Extract<VizSpec, { type: 'graph' }> }> = ({ spec }) => {
  const clipId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const compiled = useMemo(() => compileExpr(spec.expr, ['x', ...spec.params.map(p => p.name)]), [spec]);
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries(spec.params.map(p => [p.name, p.value])));
  const W = 560, H = 300, L = 44, R = 14, T = 14, B = spec.xLabel ? 50 : 34;
  const sx = (x: number) => L + ((x - spec.xmin) / (spec.xmax - spec.xmin)) * (W - L - R);
  const sy = (y: number) => T + (1 - (y - spec.ymin) / (spec.ymax - spec.ymin)) * (H - T - B);
  const xTicks = niceTicks(spec.xmin, spec.xmax, 8);
  const yTicks = niceTicks(spec.ymin, spec.ymax, 6);

  const d = useMemo(() => {
    if (!compiled) return '';
    const N = 240; let path = ''; let pen = false; let prevY = NaN;
    const span = spec.ymax - spec.ymin;
    for (let i = 0; i <= N; i++) {
      const x = spec.xmin + ((spec.xmax - spec.xmin) * i) / N;
      const y = compiled.fn({ ...vals, x });
      const ok = Number.isFinite(y) && Math.abs(y) < 1e7 && !(Number.isFinite(prevY) && Math.abs(y - prevY) > span * 4);
      if (ok) { path += `${pen ? 'L' : 'M'} ${sx(x).toFixed(1)} ${sy(y).toFixed(1)} `; pen = true; } else pen = false;
      prevY = y;
    }
    return path;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compiled, vals, spec]);

  if (!compiled) return null;
  const zeroX = spec.xmin <= 0 && spec.xmax >= 0, zeroY = spec.ymin <= 0 && spec.ymax >= 0;
  return (
    <Frame label={spec.label} color={4}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl" role="img" aria-label={spec.alt ?? `graph of y = ${spec.expr}`}>
        <defs><clipPath id={clipId}><rect x={L} y={T} width={W - L - R} height={H - T - B} /></clipPath></defs>
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="white" stroke="#cbd5e1" />
        {xTicks.map(v => (
          <g key={`x${v}`}>
            <line x1={sx(v)} y1={T} x2={sx(v)} y2={H - B} stroke="#e2e8f0" />
            <text x={sx(v)} y={H - B + 15} textAnchor="middle" fontSize="11" fill="#64748b">{fmt(v)}</text>
          </g>
        ))}
        {yTicks.map(v => (
          <g key={`y${v}`}>
            <line x1={L} y1={sy(v)} x2={W - R} y2={sy(v)} stroke="#e2e8f0" />
            <text x={L - 5} y={sy(v) + 4} textAnchor="end" fontSize="11" fill="#64748b">{fmt(v)}</text>
          </g>
        ))}
        {zeroY && <line x1={L} y1={sy(0)} x2={W - R} y2={sy(0)} stroke="#475569" strokeWidth="1.8" />}
        {zeroX && <line x1={sx(0)} y1={T} x2={sx(0)} y2={H - B} stroke="#475569" strokeWidth="1.8" />}
        <path d={d} clipPath={`url(#${clipId})`} fill="none" stroke={PALETTE[0]} strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" />
        {spec.xLabel && <text x={(L + W - R) / 2} y={H - 8} textAnchor="middle" fontSize="12" fontWeight="600" fill="#334155">{spec.xLabel}</text>}
        {spec.yLabel && <text x={11} y={(T + H - B) / 2} textAnchor="middle" fontSize="12" fontWeight="600" fill="#334155" transform={`rotate(-90 11 ${(T + H - B) / 2})`}>{spec.yLabel}</text>}
      </svg>
      <p className="text-sm font-mono font-semibold mt-1" style={{ color: PALETTE[4] }}>y = {spec.expr}</p>
      {spec.params.length > 0 && (
        <div className="mt-2 grid gap-2">
          {spec.params.map(p => (
            <label key={p.name} className="flex items-center gap-3 text-sm font-semibold text-slate-700">
              <span className="w-20 font-mono">{p.name} = {+vals[p.name].toFixed(2)}</span>
              <input
                type="range" min={p.min} max={p.max} step={p.step} value={vals[p.name]}
                aria-label={`Change ${p.name}`}
                onChange={e => setVals(v => ({ ...v, [p.name]: Number(e.target.value) }))}
                className="flex-1 accent-indigo-600"
              />
            </label>
          ))}
        </div>
      )}
    </Frame>
  );
};

// ── Table ────────────────────────────────────────────────────────────────────

const VizTable: React.FC<{ spec: Extract<VizSpec, { type: 'table' }> }> = ({ spec }) => (
  <Frame label={spec.label} color={2}>
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>{spec.columns.map((c, i) => (
            <th key={i} className="text-left px-3 py-1.5 font-bold text-white" style={{ background: PALETTE[2] }}>{c}</th>
          ))}</tr>
        </thead>
        <tbody>
          {spec.rows.map((r, ri) => (
            <tr key={ri} className={ri % 2 ? 'bg-white' : 'bg-emerald-50'}>
              {spec.columns.map((_, ci) => (
                <td key={ci} className={`px-3 py-1.5 border-t border-emerald-100 text-slate-800 ${ci === 0 ? 'font-semibold' : ''}`}>{r[ci] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Frame>
);

// ── Cycle ────────────────────────────────────────────────────────────────────

function wrapWords(s: string, max: number): string[] {
  const words = s.split(/\s+/); const lines: string[] = []; let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

const Cycle: React.FC<{ spec: Extract<VizSpec, { type: 'cycle' }> }> = ({ spec }) => {
  const n = spec.steps.length;
  const W = 560, H = n > 6 ? 340 : 300, cx = W / 2, cy = H / 2, rx = 205, ry = H / 2 - 38;
  const nw = n > 6 ? 104 : 124, nh = 42;
  const arrowId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const pos = spec.steps.map((_, i) => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });
  return (
    <Frame label={spec.label} color={7}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl" role="img" aria-label={spec.alt ?? `cycle: ${spec.steps.join(' → ')}`}>
        <defs>
          <marker id={arrowId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={PALETTE[7]} />
          </marker>
        </defs>
        {pos.map((p, i) => {
          const q = pos[(i + 1) % n];
          const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1;
          // start/end just outside each box, along the line between centres
          const inset = (ux: number, uy: number) => Math.min(Math.abs(nw / 2 / (ux || 1e-6)), Math.abs(nh / 2 / (uy || 1e-6))) + 4;
          const ux = dx / len, uy = dy / len, off = inset(ux, uy);
          return <line key={i} x1={p.x + ux * off} y1={p.y + uy * off} x2={q.x - ux * off} y2={q.y - uy * off}
            stroke={PALETTE[7]} strokeWidth="2.5" markerEnd={`url(#${arrowId})`} />;
        })}
        {pos.map((p, i) => {
          const lines = wrapWords(spec.steps[i], n > 6 ? 13 : 15);
          return (
            <g key={i}>
              <rect x={p.x - nw / 2} y={p.y - nh / 2} width={nw} height={nh} rx="10" fill={PALETTE[i % PALETTE.length]} stroke="white" strokeWidth="2" />
              {lines.map((ln, li) => (
                <text key={li} x={p.x} y={p.y + 4 + (li - (lines.length - 1) / 2) * 13} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="white">{ln}</text>
              ))}
            </g>
          );
        })}
        {spec.center && <text x={cx} y={cy + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill={PALETTE[7]}>{spec.center}</text>}
      </svg>
    </Frame>
  );
};

// ── Scene (physical/spatial sketches: inclines, forces, levers, simple layouts) ─

const Scene: React.FC<{ spec: Extract<VizSpec, { type: 'scene' }> }> = ({ spec }) => {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <Frame label={spec.label} color={6}>
      <svg viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} className="w-full max-w-xl" role="img" aria-label={spec.alt ?? 'diagram'}>
        <defs>
          {PALETTE.map((c, i) => (
            <marker key={i} id={`${id}-${i}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
            </marker>
          ))}
        </defs>
        {spec.shapes.map((sh, i) => {
          switch (sh.kind) {
            case 'line':
              return <line key={i} x1={sh.x1} y1={sh.y1} x2={sh.x2} y2={sh.y2} stroke="#475569" strokeWidth="2.5"
                strokeLinecap="round" strokeDasharray={sh.dashed ? '6 4' : undefined} />;
            case 'rect': {
              const cx = sh.x + sh.w / 2, cy = sh.y + sh.h / 2;
              return (
                <g key={i} transform={sh.rotation ? `rotate(${sh.rotation} ${cx} ${cy})` : undefined}>
                  <rect x={sh.x} y={sh.y} width={sh.w} height={sh.h} rx="4" fill={PALETTE_LIGHT[sh.color]} stroke={PALETTE_MID[sh.color]} strokeWidth="2.5" />
                  {sh.label && <text x={cx} y={cy + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill={PALETTE[sh.color]}>{sh.label}</text>}
                </g>
              );
            }
            case 'circle':
              return (
                <g key={i}>
                  <circle cx={sh.x} cy={sh.y} r={sh.r} fill={PALETTE_LIGHT[sh.color]} stroke={PALETTE_MID[sh.color]} strokeWidth="2.5" />
                  {sh.label && <text x={sh.x} y={sh.y + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill={PALETTE[sh.color]}>{sh.label}</text>}
                </g>
              );
            case 'arrow': {
              const mx = (sh.x1 + sh.x2) / 2, my = (sh.y1 + sh.y2) / 2;
              return (
                <g key={i}>
                  <line x1={sh.x1} y1={sh.y1} x2={sh.x2} y2={sh.y2} stroke={PALETTE[sh.color]} strokeWidth="3"
                    strokeLinecap="round" markerEnd={`url(#${id}-${sh.color})`} />
                  {sh.label && <text x={mx} y={my - 6} textAnchor="middle" fontSize="11.5" fontWeight="700" fill={PALETTE[sh.color]}>{sh.label}</text>}
                </g>
              );
            }
            case 'text':
              return <text key={i} x={sh.x} y={sh.y} fontSize="13" fontWeight="600" fill="#334155">{sh.text}</text>;
            default:
              return null;
          }
        })}
      </svg>
    </Frame>
  );
};

// ── Mermaid diagram (flowchart, timeline, mind map, sequence, pie) ───────────

const Diagram: React.FC<{ spec: Extract<VizSpec, { type: 'diagram' }> }> = ({ spec }) => (
  <Frame label={spec.label} color={6}>
    <Suspense fallback={<p className="text-sm text-slate-500">Drawing diagram…</p>}>
      <MermaidDiagram code={spec.code} alt={spec.alt} />
    </Suspense>
  </Frame>
);

// ─── Router ───────────────────────────────────────────────────────────────────

const Picture: React.FC<{ spec: VizSpec }> = ({ spec }) => {
  switch (spec.type) {
    case 'counters':        return <Counters spec={spec} />;
    case 'number-line':     return <NumberLine spec={spec} />;
    case 'tape':            return <Tape spec={spec} />;
    case 'array':           return <DotArray spec={spec} />;
    case 'fraction-bar':    return <FractionBar spec={spec} />;
    case 'fraction-circle': return <FractionCircle spec={spec} />;
    case 'bar-chart':       return <BarChart spec={spec} />;
    case 'line-chart':      return <LineChart spec={spec} />;
    case 'graph':           return <InteractiveGraph spec={spec} />;
    case 'table':           return <VizTable spec={spec} />;
    case 'cycle':           return <Cycle spec={spec} />;
    case 'diagram':         return <Diagram spec={spec} />;
    case 'scene':           return <Scene spec={spec} />;
    default:                return null;
  }
};

/** Draws one validated picture, with a screen-reader description when the coach supplied one. */
export const MathVizRenderer: React.FC<{ spec: VizSpec }> = ({ spec }) => (
  <div role="group" aria-label={spec.alt}>
    <Picture spec={spec} />
    {spec.alt && <span className="sr-only">{spec.alt}</span>}
  </div>
);

/** Shown in place of a picture the coach asked for but that could not be drawn. */
export const VizFallback: React.FC = () => (
  <p className="my-2 text-xs italic text-slate-500">(A picture was meant to appear here but could not be drawn. The explanation above still applies.)</p>
);
