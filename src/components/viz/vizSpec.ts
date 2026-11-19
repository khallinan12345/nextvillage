// src/components/viz/vizSpec.ts
//
// The picture "language" the AI coach speaks. The model writes a small JSON spec inside a
// ```viz block (or Mermaid code inside a ```mermaid block); the site validates it here and
// draws it in VizRenderer. The model decides WHAT to show; the site decides HOW it looks,
// so pictures look the same whichever AI model answers.
//
// Pure functions only (no React) so everything here is unit-tested.

import { compileExpr } from './expr';

export const PALETTE = ['#4f46e5', '#f59e0b', '#059669', '#e11d48', '#0284c7', '#7c3aed', '#ea580c', '#0d9488'];
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

type Alt = { alt?: string };

export type GraphParam = { name: string; min: number; max: number; value: number; step: number };
export type SeriesPoint = [string | number, number];

export type VizSpec = Alt & (
  | { type: 'counters'; groups: { count: number; emoji?: string; label?: string }[] }
  | { type: 'number-line'; min?: number; max: number; step?: number; points?: number[]; jump?: { from: number; to: number; label?: string } }
  | { type: 'tape'; label?: string; parts: { value: number; label?: string; color?: string }[]; total?: number }
  | { type: 'array'; rows: number; cols: number; label?: string }
  | { type: 'fraction-bar'; parts: number; shaded: number; label?: string }
  | { type: 'fraction-circle'; parts: number; shaded: number; label?: string }
  | { type: 'bar-chart'; label?: string; bars: { label: string; value: number }[] }
  | { type: 'line-chart'; label?: string; xLabel?: string; yLabel?: string; style: 'line' | 'scatter'; series: { name: string; points: SeriesPoint[] }[] }
  | { type: 'graph'; label?: string; expr: string; params: GraphParam[]; xmin: number; xmax: number; ymin: number; ymax: number; xLabel?: string; yLabel?: string }
  | { type: 'table'; label?: string; columns: string[]; rows: string[][] }
  | { type: 'cycle'; label?: string; center?: string; steps: string[] }
  | { type: 'diagram'; label?: string; code: string }
);

export interface ParsedSegment {
  kind: 'text' | 'viz' | 'viz-error';
  text?: string;
  spec?: VizSpec;
}

// ```viz {json} ```   or   ```mermaid code ```
const BLOCK_RE = /```(viz|mermaid)[ \t]*\r?\n?([\s\S]*?)```/g;
// A fence that was opened but never closed (reply was cut off): never show it as raw text.
const OPEN_FENCE_RE = /```(?:viz|mermaid)[\s\S]*$/;

/** Split message content into text segments, validated pictures, and pictures that failed. */
export function parseVizContent(content: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  let last = 0;
  for (const m of content.matchAll(BLOCK_RE)) {
    if (m.index! > last) segments.push({ kind: 'text', text: content.slice(last, m.index) });
    const spec = m[1] === 'mermaid' ? diagramSpec(m[2]) : safeParseSpec(m[2]);
    segments.push(spec ? { kind: 'viz', spec } : { kind: 'viz-error' });
    last = m.index! + m[0].length;
  }
  let tail = content.slice(last);
  const open = OPEN_FENCE_RE.exec(tail);
  if (open) {
    if (open.index > 0) segments.push({ kind: 'text', text: tail.slice(0, open.index) });
    segments.push({ kind: 'viz-error' });
    tail = '';
  }
  if (tail) segments.push({ kind: 'text', text: tail });
  return segments;
}

/** Remove picture blocks before text-to-speech so the coach never reads JSON aloud. */
export function stripVizForSpeech(content: string): string {
  return content
    .replace(BLOCK_RE, '')
    .replace(OPEN_FENCE_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const MERMAID_START = /^(flowchart|graph|timeline|mindmap|sequenceDiagram|pie|stateDiagram-v2|journey)\b/;
const MERMAID_FORBIDDEN = /(<\s*script|<\s*iframe|<\s*img|javascript:|%%\{|\bclick\b|\bcallback\b|onerror|onload)/i;

function cleanAlt(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : undefined;
}

export function diagramSpec(raw: string, label?: string, alt?: string): VizSpec | null {
  const code = String(raw ?? '').replace(/\r\n/g, '\n').trim();
  if (!code || code.length > 2500) return null;
  const first = code.split('\n').find(l => l.trim() && !l.trim().startsWith('%%')) ?? '';
  if (!MERMAID_START.test(first.trim())) return null;
  if (MERMAID_FORBIDDEN.test(code)) return null;
  return { type: 'diagram', code, label: typeof label === 'string' ? label.slice(0, 80) : undefined, alt };
}

const num = (v: unknown, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
const str = (v: unknown, max: number) => String(v ?? '').slice(0, max);

function parseSeriesPoint(p: unknown): SeriesPoint | null {
  if (!Array.isArray(p) || p.length < 2) return null;
  const y = Number(p[1]);
  if (!Number.isFinite(y)) return null;
  const xr = p[0];
  const xn = typeof xr === 'number' ? xr : (typeof xr === 'string' && xr.trim() !== '' && Number.isFinite(Number(xr)) ? Number(xr) : null);
  return [xn !== null ? xn : str(xr, 14), y];
}

/** Sample the curve over the slider ranges to pick a y-range when the model did not give one. */
function autoYRange(fn: (v: Record<string, number>) => number, params: GraphParam[], xmin: number, xmax: number): [number, number] {
  const combos: Record<string, number>[] = [{}];
  for (const p of params.slice(0, 3)) {
    const next: Record<string, number>[] = [];
    for (const c of combos) for (const val of [p.min, p.value, p.max]) next.push({ ...c, [p.name]: val });
    combos.length = 0; combos.push(...next);
  }
  let lo = Infinity, hi = -Infinity;
  for (const c of combos) {
    for (let i = 0; i <= 60; i++) {
      const y = fn({ ...c, x: xmin + ((xmax - xmin) * i) / 60 });
      if (Number.isFinite(y) && Math.abs(y) < 1e6) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [-10, 10];
  if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.08;
  return [lo - pad, hi + pad];
}

export function safeParseSpec(raw: string): VizSpec | null {
  try {
    const s = JSON.parse(raw.trim());
    if (!s || typeof s.type !== 'string') return null;
    const alt = cleanAlt(s.alt);
    const label = typeof s.label === 'string' ? s.label.slice(0, 80) : undefined;
    const withAlt = <T extends VizSpec>(spec: T): T => ({ ...spec, alt });

    switch (s.type) {
      case 'counters':
        if (!Array.isArray(s.groups) || s.groups.length === 0) return null;
        return withAlt({
          type: 'counters',
          groups: s.groups.slice(0, 6).map((g: any) => ({
            count: clamp(Math.round(num(g.count)), 0, 30),
            emoji: typeof g.emoji === 'string' ? g.emoji.slice(0, 4) : '🔵',
            label: typeof g.label === 'string' ? g.label.slice(0, 24) : undefined,
          })),
        });
      case 'number-line': {
        const max = Number(s.max);
        if (!isFinite(max) || max <= 0) return null;
        const min = isFinite(Number(s.min)) ? Number(s.min) : 0;
        const cappedMax = Math.min(max, 100000);
        if (cappedMax <= min) return null;
        const jumpOk = s.jump && isFinite(Number(s.jump.from)) && isFinite(Number(s.jump.to));
        return withAlt({
          type: 'number-line', min, max: cappedMax,
          step: isFinite(Number(s.step)) && Number(s.step) > 0 ? Number(s.step) : undefined,
          points: Array.isArray(s.points) ? s.points.map(Number).filter(isFinite).slice(0, 8) : [],
          jump: jumpOk ? { from: Number(s.jump.from), to: Number(s.jump.to), label: typeof s.jump.label === 'string' ? s.jump.label.slice(0, 20) : undefined } : undefined,
        });
      }
      case 'tape': {
        if (!Array.isArray(s.parts) || s.parts.length === 0) return null;
        const parts = s.parts.slice(0, 6).map((p: any, i: number) => ({
          value: Math.abs(num(p.value)),
          label: typeof p.label === 'string' ? p.label.slice(0, 16) : String(p.value ?? ''),
          color: PALETTE[i % PALETTE.length],
        })).filter((p: any) => p.value > 0);
        if (!parts.length) return null;
        return withAlt({ type: 'tape', label, parts, total: s.total !== undefined && isFinite(Number(s.total)) ? Number(s.total) : undefined });
      }
      case 'array':
        return withAlt({ type: 'array', label, rows: clamp(Math.round(num(s.rows)), 1, 12), cols: clamp(Math.round(num(s.cols)), 1, 15) });
      case 'fraction-bar':
      case 'fraction-circle': {
        const parts = clamp(Math.round(num(s.parts)), 1, 24);
        return withAlt({ type: s.type, label, parts, shaded: clamp(Math.round(num(s.shaded)), 0, parts) });
      }
      case 'bar-chart':
        if (!Array.isArray(s.bars) || s.bars.length === 0) return null;
        return withAlt({
          type: 'bar-chart', label,
          bars: s.bars.slice(0, 8).map((b: any) => ({ label: str(b.label, 14), value: Math.abs(num(b.value)) })),
        });
      case 'line-chart': {
        if (!Array.isArray(s.series) || s.series.length === 0) return null;
        const series = s.series.slice(0, 4).map((se: any, i: number) => ({
          name: str(se?.name ?? `Series ${i + 1}`, 24),
          points: (Array.isArray(se?.points) ? se.points : []).slice(0, 40).map(parseSeriesPoint).filter(Boolean) as SeriesPoint[],
        })).filter((se: { points: SeriesPoint[] }) => se.points.length >= 1);
        if (!series.length) return null;
        return withAlt({
          type: 'line-chart', label, series,
          style: s.style === 'scatter' ? 'scatter' : 'line',
          xLabel: typeof s.xLabel === 'string' ? s.xLabel.slice(0, 40) : undefined,
          yLabel: typeof s.yLabel === 'string' ? s.yLabel.slice(0, 40) : undefined,
        });
      }
      case 'graph': {
        if (typeof s.expr !== 'string') return null;
        const params: GraphParam[] = (Array.isArray(s.params) ? s.params : []).slice(0, 3).map((p: any) => {
          const min = num(p?.min, -5), max = num(p?.max, 5);
          const lo = Math.min(min, max), hi = Math.max(min, max);
          return {
            name: String(p?.name ?? '').slice(0, 6),
            min: lo, max: hi === lo ? lo + 1 : hi,
            value: clamp(num(p?.value, lo), lo, hi === lo ? lo + 1 : hi),
            step: num(p?.step, (hi - lo) / 20) > 0 ? num(p?.step, (hi - lo) / 20) : (hi - lo) / 20 || 0.1,
          };
        }).filter((p: GraphParam) => /^[a-wyzA-Z]$/.test(p.name)); // single letter; x is the horizontal axis
        const compiled = compileExpr(s.expr, ['x', ...params.map(p => p.name)]);
        if (!compiled) return null;
        const xmin = num(s.xmin, -10), xmax = num(s.xmax, 10);
        if (!(xmax > xmin)) return null;
        let ymin = Number(s.ymin), ymax = Number(s.ymax);
        if (!(Number.isFinite(ymin) && Number.isFinite(ymax) && ymax > ymin)) {
          [ymin, ymax] = autoYRange(compiled.fn, params, xmin, xmax);
        }
        return withAlt({
          type: 'graph', label, expr: s.expr.slice(0, 120), params, xmin, xmax, ymin, ymax,
          xLabel: typeof s.xLabel === 'string' ? s.xLabel.slice(0, 40) : undefined,
          yLabel: typeof s.yLabel === 'string' ? s.yLabel.slice(0, 40) : undefined,
        });
      }
      case 'table': {
        if (!Array.isArray(s.columns) || !Array.isArray(s.rows) || s.columns.length === 0 || s.rows.length === 0) return null;
        const columns = s.columns.slice(0, 6).map((c: unknown) => str(c, 30));
        const rows = s.rows.slice(0, 12).map((r: unknown) => (Array.isArray(r) ? r : []).slice(0, columns.length).map((c: unknown) => str(c, 60)));
        return withAlt({ type: 'table', label, columns, rows });
      }
      case 'cycle': {
        if (!Array.isArray(s.steps) || s.steps.length < 3) return null;
        return withAlt({
          type: 'cycle', label,
          center: typeof s.center === 'string' ? s.center.slice(0, 28) : undefined,
          steps: s.steps.slice(0, 8).map((x: unknown) => str(x, 28)),
        });
      }
      case 'diagram':
        return diagramSpec(s.code, label, alt);
      default:
        return null;
    }
  } catch {
    return null;
  }
}
