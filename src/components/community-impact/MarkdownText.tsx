// src/components/community-impact/MarkdownText.tsx
//
// Shared renderer for AI response text across the community-impact
// consultant pages. Was duplicated near-identically in AdvisorCasebookPage,
// HealthcareNavigatorPage, EntrepreneurshipConsultantPage, and
// AIAmbassadorsPage — this is the one copy, now also handling the optional
// trailing <illustration> block (see illustrationParser.ts /
// SceneIllustration.tsx). Same `{ text }` prop as before, so every existing
// call site (<MarkdownText text={...} />) works unchanged.

import React from 'react';
import { extractIllustration } from './illustrationParser';
import { SceneIllustration } from './SceneIllustration';
import { escapeHtml } from '../../lib/escapeHtml';
import { parseVizContent } from '../viz/vizSpec';
import { MathVizRenderer, VizFallback } from '../viz/VizRenderer';

export const MarkdownText: React.FC<{ text: string }> = ({ text }) => {
  const { text: cleanedText, scene } = extractIllustration(text);

  const renderLines = (t: string, key: string) => t.split('\n').map((line, i) => {
    if (!line.trim()) return <div key={`${key}-${i}`} className="h-1.5" />;
    const html = escapeHtml(line)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');
    return <p key={`${key}-${i}`} className="leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />;
  });

  return (
    <div className="stack-y-1.5">
      {parseVizContent(cleanedText).map((seg, s) => {
        if (seg.kind === 'viz' && seg.spec) return <MathVizRenderer key={s} spec={seg.spec} />;
        if (seg.kind === 'viz-error') return <VizFallback key={s} />;
        return renderLines(seg.text ?? '', String(s));
      })}
      {scene && <SceneIllustration scene={scene} />}
    </div>
  );
};
