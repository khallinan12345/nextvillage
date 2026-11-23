import { describe, it, expect } from 'vitest';
import { parseVizContent, stripVizForSpeech, safeParseSpec } from './vizSpec';

const block = (json: unknown) => '```viz\n' + JSON.stringify(json) + '\n```';

describe('parseVizContent', () => {
  it('splits text and pictures', () => {
    const segs = parseVizContent('Look:\n' + block({ type: 'array', rows: 2, cols: 3 }) + '\nNice.');
    expect(segs.map(s => s.kind)).toEqual(['text', 'viz', 'text']);
  });
  it('turns malformed JSON into a visible failure, not silence', () => {
    const segs = parseVizContent('Hi\n```viz\n{not json}\n```\nbye');
    expect(segs.map(s => s.kind)).toEqual(['text', 'viz-error', 'text']);
  });
  it('treats a cut-off fence as a failed picture and never shows raw code', () => {
    const segs = parseVizContent('Hello\n```viz\n{"type":"bar-chart","bars":[');
    expect(segs.map(s => s.kind)).toEqual(['text', 'viz-error']);
  });
  it('reads mermaid blocks', () => {
    const segs = parseVizContent('```mermaid\nflowchart TD\n A-->B\n```');
    expect(segs[0].kind).toBe('viz');
    expect(segs[0].spec?.type).toBe('diagram');
  });
  it('rejects unsafe or unknown mermaid', () => {
    expect(parseVizContent('```mermaid\nflowchart TD\n A-->B\n click A callback\n```')[0].kind).toBe('viz-error');
    expect(parseVizContent('```mermaid\nsomething else\n```')[0].kind).toBe('viz-error');
    expect(parseVizContent('```mermaid\n%%{init: {"securityLevel":"loose"}}%%\nflowchart TD\n A-->B\n```')[0].kind).toBe('viz-error');
  });
});

describe('stripVizForSpeech', () => {
  it('removes closed, mermaid and cut-off blocks', () => {
    const s = 'One.\n' + block({ type: 'array', rows: 1, cols: 1 }) + '\nTwo.\n```mermaid\nflowchart TD\nA-->B\n```\nThree.\n```viz\n{"ty';
    expect(stripVizForSpeech(s)).toBe('One.\n\nTwo.\n\nThree.');
  });
});

describe('safeParseSpec', () => {
  it('keeps the original math pictures working', () => {
    expect(safeParseSpec(JSON.stringify({ type: 'counters', groups: [{ count: 99, emoji: '🥭' }] }))).toMatchObject({ groups: [{ count: 30 }] });
    expect(safeParseSpec(JSON.stringify({ type: 'fraction-bar', parts: 5, shaded: 9 }))).toMatchObject({ shaded: 5 });
    expect(safeParseSpec(JSON.stringify({ type: 'tape', parts: [{ value: 3 }, { value: 4 }], total: 7 }))).toMatchObject({ total: 7 });
    expect(safeParseSpec('{"type":"nope"}')).toBeNull();
  });
  it('keeps the alt text', () => {
    expect(safeParseSpec(JSON.stringify({ type: 'array', rows: 2, cols: 2, alt: 'four dots' }))).toMatchObject({ alt: 'four dots' });
  });
  it('line chart: numeric and word x-values, caps', () => {
    const num = safeParseSpec(JSON.stringify({ type: 'line-chart', series: [{ name: 'a', points: [[1, 2], [2, 4]] }] }));
    expect(num).toMatchObject({ type: 'line-chart', style: 'line' });
    const cat = safeParseSpec(JSON.stringify({ type: 'line-chart', series: [{ name: 'a', points: [['Jan', 2], ['Feb', 4]] }] }));
    expect((cat as any).series[0].points[0][0]).toBe('Jan');
    expect(safeParseSpec(JSON.stringify({ type: 'line-chart', series: [{ name: 'a', points: [['x', 'bad']] }] }))).toBeNull();
  });
  it('graph: accepts a safe formula and rejects code', () => {
    const ok = safeParseSpec(JSON.stringify({ type: 'graph', expr: 'a*x^2', params: [{ name: 'a', min: -2, max: 2, value: 1 }], xmin: -3, xmax: 3 }));
    expect(ok).toMatchObject({ type: 'graph' });
    expect((ok as any).ymax).toBeGreaterThan((ok as any).ymin); // auto range filled in
    expect(safeParseSpec(JSON.stringify({ type: 'graph', expr: 'alert(1)', params: [], xmin: 0, xmax: 1 }))).toBeNull();
    expect(safeParseSpec(JSON.stringify({ type: 'graph', expr: 'x', params: [], xmin: 5, xmax: 1 }))).toBeNull();
  });
  it('table and cycle need enough content', () => {
    expect(safeParseSpec(JSON.stringify({ type: 'table', columns: ['A'], rows: [['1']] }))).toMatchObject({ type: 'table' });
    expect(safeParseSpec(JSON.stringify({ type: 'table', columns: [], rows: [] }))).toBeNull();
    expect(safeParseSpec(JSON.stringify({ type: 'cycle', steps: ['a', 'b'] }))).toBeNull();
    expect(safeParseSpec(JSON.stringify({ type: 'cycle', steps: ['a', 'b', 'c'] }))).toMatchObject({ type: 'cycle' });
  });
  it('diagram inside viz json', () => {
    expect(safeParseSpec(JSON.stringify({ type: 'diagram', code: 'flowchart LR\nA-->B' }))).toMatchObject({ type: 'diagram' });
  });
  it('scene: draws physical/spatial shapes, clamps and drops bad ones', () => {
    const ok = safeParseSpec(JSON.stringify({
      type: 'scene',
      shapes: [
        { kind: 'line', x1: 0, y1: 240, x2: 400, y2: 240 },
        { kind: 'rect', x: 165, y: 137, w: 50, h: 26, rotation: 999, color: 99, label: 'Block' },
        { kind: 'arrow', x1: 190, y1: 150, x2: 190, y2: 210, color: 3, label: 'gravity' },
        { kind: 'circle', x: 50, y: 50, r: 9999 },
        { kind: 'text', x: 10, y: 10, text: 'theta' },
        { kind: 'nonsense' },
        { kind: 'text', x: 1, y: 1, text: '   ' },
      ],
    })) as any;
    expect(ok.type).toBe('scene');
    expect(ok.shapes).toHaveLength(5); // the two invalid shapes are dropped
    expect(ok.shapes[1].rotation).toBe(180); // clamped into [-180, 180]
    expect(ok.shapes[1].color).toBe(7); // clamped into [0, PALETTE.length - 1]
    expect(ok.shapes[3].r).toBe(140); // clamped
    expect(safeParseSpec(JSON.stringify({ type: 'scene', shapes: [] }))).toBeNull();
    expect(safeParseSpec(JSON.stringify({ type: 'scene', shapes: [{ kind: 'nonsense' }] }))).toBeNull();
  });
});
