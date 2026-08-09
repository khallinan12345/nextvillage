// src/components/MathViz.tsx
//
// Deterministic SVG renderers for math visualizations, driven by small JSON
// specs the AI coach emits inside ```viz fenced blocks. The model declares
// WHAT to show; this file decides HOW it looks — so output quality is
// identical across every provider in the chat.js fallback chain.
//
// Supported spec types:
//   counters       — groups of emoji objects for counting / early addition
//   number-line    — 0..max line with highlighted points and a jump arc
//   tape           — Singapore bar model for +, −, comparison, part-whole
//   array          — rows × cols dot array for multiplication
//   fraction-bar   — partitioned bar with shaded parts
//   fraction-circle— partitioned circle with shaded sectors
//   bar-chart      — labeled bar chart for data / ratio / rate problems

import React from 'react';

// ─── Spec types ───────────────────────────────────────────────────────────────

export type VizSpec =
  | { type: 'counters'; groups: { count: number; emoji?: string; label?: string }[] }
  | { type: 'number-line'; min?: number; max: number; step?: number; points?: number[]; jump?: { from: number; to: number; label?: string } }
  | { type: 'tape'; label?: string; parts: { value: number; label?: string; color?: string }[]; total?: number }
  | { type: 'array'; rows: number; cols: number; label?: string }
  | { type: 'fraction-bar'; parts: number; shaded: number; label?: string }
  | { type: 'fraction-circle'; parts: number; shaded: number; label?: string }
  | { type: 'bar-chart'; label?: string; bars: { label: string; value: number }[] };

// ─── Color palette ────────────────────────────────────────────────────────────

// Vivid: indigo · amber · emerald · rose · sky · violet · orange · teal
const PALETTE       = ['#4f46e5','#f59e0b','#059669','#e11d48','#0284c7','#7c3aed','#ea580c','#0d9488'];
const PALETTE_LIGHT = ['#eef2ff','#fffbeb','#ecfdf5','#fff1f2','#e0f2fe','#f5f3ff','#fff7ed','#f0fdfa'];
const PALETTE_MID   = ['#818cf8','#fcd34d','#34d399','#fb7185','#38bdf8','#a78bfa','#fb923c','#2dd4bf'];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// ─── Parsing ──────────────────────────────────────────────────────────────────

export interface ParsedSegment {
  kind: 'text' | 'viz';
  text?: string;
  spec?: VizSpec;
}

const VIZ_RE = /```viz\s*([\s\S]*?)```/g;

/** Split message content into text segments and validated viz specs. */
export function parseVizContent(content: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  let last = 0;
  for (const m of content.matchAll(VIZ_RE)) {
    if (m.index! > last) segments.push({ kind: 'text', text: content.slice(last, m.index) });
    const spec = safeParseSpec(m[1]);
    if (spec) segments.push({ kind: 'viz', spec });
    last = m.index! + m[0].length;
  }
  if (last < content.length) segments.push({ kind: 'text', text: content.slice(last) });
  return segments;
}

/** Remove viz blocks before TTS so the coach never reads JSON aloud. */
export function stripVizForSpeech(content: string): string {
  return content.replace(VIZ_RE, '').replace(/\n{3,}/g, '\n\n').trim();
}

function safeParseSpec(raw: string): VizSpec | null {
  try {
    const s = JSON.parse(raw.trim());
    if (!s || typeof s.type !== 'string') return null;
    switch (s.type) {
      case 'counters':
        if (!Array.isArray(s.groups) || s.groups.length === 0) return null;
        s.groups = s.groups.slice(0, 6).map((g: any) => ({
          count: clamp(Math.round(Number(g.count) || 0), 0, 30),
          emoji: typeof g.emoji === 'string' ? g.emoji.slice(0, 4) : '🔵',
          label: typeof g.label === 'string' ? g.label.slice(0, 24) : undefined,
        }));
        return s;
      case 'number-line': {
        const max = Number(s.max);
        if (!isFinite(max) || max <= 0) return null;
        s.min = isFinite(Number(s.min)) ? Number(s.min) : 0;
        s.max = Math.min(max, 100000);
        if (s.max <= s.min) return null;
        s.points = Array.isArray(s.points) ? s.points.map(Number).filter(isFinite).slice(0, 8) : [];
        if (s.jump && (!isFinite(Number(s.jump.from)) || !isFinite(Number(s.jump.to)))) s.jump = undefined;
        return s;
      }
      case 'tape':
        if (!Array.isArray(s.parts) || s.parts.length === 0) return null;
        s.parts = s.parts.slice(0, 6).map((p: any, i: number) => ({
          value: Math.abs(Number(p.value) || 0),
          label: typeof p.label === 'string' ? p.label.slice(0, 16) : String(p.value ?? ''),
          color: PALETTE[i % PALETTE.length],
        })).filter((p: any) => p.value > 0);
        return s.parts.length ? s : null;
      case 'array':
        s.rows = clamp(Math.round(Number(s.rows) || 0), 1, 12);
        s.cols = clamp(Math.round(Number(s.cols) || 0), 1, 15);
        return s;
      case 'fraction-bar':
      case 'fraction-circle':
        s.parts = clamp(Math.round(Number(s.parts) || 0), 1, 24);
        s.shaded = clamp(Math.round(Number(s.shaded) || 0), 0, s.parts);
        return s;
      case 'bar-chart':
        if (!Array.isArray(s.bars) || s.bars.length === 0) return null;
        s.bars = s.bars.slice(0, 8).map((b: any) => ({
          label: String(b.label ?? '').slice(0, 14),
          value: Math.abs(Number(b.value) || 0),
        }));
        return s;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ─── Renderers ────────────────────────────────────────────────────────────────

const Frame: React.FC<{ label?: string; children: React.ReactNode; color?: number }> = ({ label, children, color = 0 }) => {
  const c = color % PALETTE.length;
  return (
    <div
      className="my-2 rounded-xl p-3 shadow-sm"
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
          className="rounded-xl px-3 py-2 shadow-sm"
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

// ─── Router ───────────────────────────────────────────────────────────────────

export const MathVizRenderer: React.FC<{ spec: VizSpec }> = ({ spec }) => {
  switch (spec.type) {
    case 'counters':        return <Counters spec={spec} />;
    case 'number-line':     return <NumberLine spec={spec} />;
    case 'tape':            return <Tape spec={spec} />;
    case 'array':           return <DotArray spec={spec} />;
    case 'fraction-bar':    return <FractionBar spec={spec} />;
    case 'fraction-circle': return <FractionCircle spec={spec} />;
    case 'bar-chart':       return <BarChart spec={spec} />;
    default:                return null;
  }
};

// ─── System prompt block ──────────────────────────────────────────────────────

export const VIZ_INSTRUCTIONS = `
═══════════════════════════════════════════════
VISUALIZATIONS — MANDATORY FOR EVERY RESPONSE
═══════════════════════════════════════════════
You MUST include a viz block in EVERY single response — no exceptions.
Every question you pose, every concept you explain, every error you
correct, every worked example needs a visual. A child learns by seeing.
Text alone is not enough.

Place the viz block on its own lines immediately after the sentence it
illustrates. Use ONLY valid JSON inside the block. Never describe the
JSON in prose. Maximum 2 blocks per response.

Choose the right type:
• Small counts (≤ 30/group) + story objects  → counters
• Adding, subtracting, skip-counting          → number-line with jump
• Part-whole, comparing two amounts           → tape
• Equal groups, times tables                  → array
• Fraction of something                       → fraction-bar (long things) or fraction-circle (round things)
• Comparing quantities, data, rates           → bar-chart

Examples — copy these shapes exactly:

Counting:
\`\`\`viz
{"type":"counters","groups":[{"count":7,"emoji":"🥭","label":"mangoes"},{"count":3,"emoji":"🥭","label":"mangoes"}]}
\`\`\`

Number line (addition / subtraction / skip-counting):
\`\`\`viz
{"type":"number-line","min":0,"max":50,"points":[23,42],"jump":{"from":23,"to":42,"label":"+19"}}
\`\`\`

Tape / bar model (part-whole, comparison):
\`\`\`viz
{"type":"tape","label":"23 + 19 = ?","parts":[{"value":23,"label":"23"},{"value":19,"label":"19"}],"total":42}
\`\`\`

Multiplication array:
\`\`\`viz
{"type":"array","rows":4,"cols":6,"label":"4 × 6 = 24"}
\`\`\`

Fraction bar:
\`\`\`viz
{"type":"fraction-bar","parts":5,"shaded":2,"label":"2/5 of the farm"}
\`\`\`

Fraction circle:
\`\`\`viz
{"type":"fraction-circle","parts":4,"shaded":3,"label":"3/4"}
\`\`\`

Bar chart (data, rates, ratios):
\`\`\`viz
{"type":"bar-chart","label":"Fish caught per day","bars":[{"label":"Mon","value":12},{"label":"Tue","value":18},{"label":"Wed","value":9}]}
\`\`\`

Hard rules:
- Every number in the JSON must match the numbers in your words exactly.
- Pick emoji from the student's chosen topic (market → 🧺, fishing → 🐟, animals → 🐄).
- Valid JSON only: double quotes, no trailing commas, no comments.
- When unsure which type: counters for ≤ 30, tape for larger values.`;
