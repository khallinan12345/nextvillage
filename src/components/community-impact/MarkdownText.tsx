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

export const MarkdownText: React.FC<{ text: string }> = ({ text }) => {
  const { text: cleanedText, scene } = extractIllustration(text);

  return (
    <div className="space-y-1.5">
      {cleanedText.split('\n').map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1.5" />;
        const html = line
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>');
        return <p key={i} className="leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />;
      })}
      {scene && <SceneIllustration scene={scene} />}
    </div>
  );
};
