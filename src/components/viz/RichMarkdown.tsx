// src/components/viz/RichMarkdown.tsx
//
// Shared renderer for AI replies on pages that format with Markdown: text goes through
// react-markdown (with LaTeX math), and any ```viz / ```mermaid blocks become pictures.
// Single-dollar math is OFF on purpose: replies are full of money like "$5 and $10", which
// must stay money. Real formulas use $$ ... $$.
// Pass the page's own `components` map to keep its existing look.

import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { parseVizContent } from './vizSpec';
import { MathVizRenderer, VizFallback } from './VizRenderer';

export const RichMarkdown: React.FC<{ text: string; components?: Components }> = ({ text, components }) => {
  const segments = parseVizContent(text);
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === 'viz' && seg.spec) return <MathVizRenderer key={i} spec={seg.spec} />;
        if (seg.kind === 'viz-error') return <VizFallback key={i} />;
        if (!seg.text?.trim()) return null;
        return (
          <ReactMarkdown key={i} remarkPlugins={[[remarkMath, { singleDollarTextMath: false }]]} rehypePlugins={[rehypeKatex]} components={components}>
            {seg.text}
          </ReactMarkdown>
        );
      })}
    </>
  );
};
