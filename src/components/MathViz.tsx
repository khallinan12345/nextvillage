// src/components/MathViz.tsx
//
// Kept so older imports keep working. The picture system now lives in src/components/viz/
// (vizSpec.ts = what the coach can ask for, VizRenderer.tsx = how it is drawn, vizPrompt.ts =
// what the coach is told). New code should import from there.

export { parseVizContent, stripVizForSpeech, type VizSpec, type ParsedSegment } from './viz/vizSpec';
export { MathVizRenderer, VizFallback } from './viz/VizRenderer';
export { buildVizInstructions, VIZ_INSTRUCTIONS } from './viz/vizPrompt';
