import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MathVizRenderer, VizFallback } from './VizRenderer';
import { safeParseSpec } from './vizSpec';

const draw = (spec: unknown) => {
  const parsed = safeParseSpec(JSON.stringify(spec));
  expect(parsed).not.toBeNull();
  return renderToStaticMarkup(<MathVizRenderer spec={parsed!} />);
};

describe('every picture type draws', () => {
  it('original math pictures', () => {
    expect(draw({ type: 'counters', groups: [{ count: 3, emoji: '🥭' }] })).toContain('🥭');
    expect(draw({ type: 'number-line', max: 20, jump: { from: 3, to: 9, label: '+6' } })).toContain('+6');
    expect(draw({ type: 'tape', parts: [{ value: 3 }, { value: 4 }], total: 7 })).toContain('<svg');
    expect(draw({ type: 'array', rows: 2, cols: 3 })).toContain('<circle');
    expect(draw({ type: 'fraction-bar', parts: 4, shaded: 1 })).toContain('<rect');
    expect(draw({ type: 'fraction-circle', parts: 4, shaded: 1 })).toContain('<path');
    expect(draw({ type: 'bar-chart', bars: [{ label: 'A', value: 3 }] })).toContain('>A<');
  });
  it('line chart, with numbers and with words', () => {
    const a = draw({ type: 'line-chart', xLabel: 'Week', yLabel: 'cm', series: [{ name: 'Sun', points: [[1, 2], [2, 5]] }, { name: 'Shade', points: [[1, 1], [2, 2]] }] });
    expect(a).toContain('<polyline'); expect(a).toContain('Week'); expect(a).toContain('Shade');
    expect(draw({ type: 'line-chart', series: [{ name: 's', points: [['Jan', 40], ['Feb', 55]] }] })).toContain('Jan');
    expect(draw({ type: 'line-chart', style: 'scatter', series: [{ name: 's', points: [[1, 1], [2, 4]] }] })).not.toContain('<polyline');
  });
  it('interactive graph draws a curve and a slider per parameter', () => {
    const h = draw({ type: 'graph', expr: 'a*x^2 + b', params: [{ name: 'a', min: -3, max: 3, value: 1 }, { name: 'b', min: -5, max: 5, value: 0 }], xmin: -5, xmax: 5, ymin: -10, ymax: 10, alt: 'a parabola' });
    expect(h).toMatch(/<path d="M [^"]+ L [^"]+"/);
    expect((h.match(/type="range"/g) ?? []).length).toBe(2);
    expect(h).toContain('a parabola');
  });
  it('table, cycle', () => {
    const t = draw({ type: 'table', columns: ['', 'A', 'B'], rows: [['Rate', '5%', '8%']] });
    expect(t).toContain('<table'); expect(t).toContain('8%');
    const c = draw({ type: 'cycle', center: 'Water', steps: ['Evaporation', 'Condensation', 'Rain'] });
    expect(c).toContain('Condensation'); expect(c).toContain('marker-end');
  });
  it('diagram shows a placeholder first (Mermaid loads on demand)', () => {
    expect(draw({ type: 'diagram', code: 'flowchart TD\nA-->B' })).toContain('Drawing diagram');
  });
  it('failed picture note', () => {
    expect(renderToStaticMarkup(<VizFallback />)).toContain('could not be drawn');
  });
});
