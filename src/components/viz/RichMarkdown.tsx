// src/components/viz/RichMarkdown.tsx
//
// Shared renderer for AI replies on pages that format with Markdown: text goes through
// react-markdown (GFM tables + LaTeX math), and any ```viz / ```mermaid blocks become pictures.
// Single-dollar math is OFF on purpose: replies are full of money like "$5 and $10", which
// must stay money. Real formulas use $$ ... $$.
// Pass the page's own `components` map to keep its existing look; a plain GFM table still gets
// a sensible default style even if the page never asked for one.

import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { parseVizContent } from './vizSpec';
import { MathVizRenderer, VizFallback } from './VizRenderer';

const remarkPlugins = [remarkGfm, [remarkMath, { singleDollarTextMath: false }]] as const;

const defaultTableComponents: Components = {
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface">{children}</thead>,
  th: ({ children }) => <th className="text-left px-3 py-1.5 font-semibold text-ink border-b border-hair">{children}</th>,
  td: ({ children }) => <td className="px-3 py-1.5 border-b border-hair text-body align-top">{children}</td>,
};

export const RichMarkdown: React.FC<{ text: string; components?: Components }> = ({ text, components }) => {
  const segments = parseVizContent(text);
  const merged = { ...defaultTableComponents, ...components };
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === 'viz' && seg.spec) return <MathVizRenderer key={i} spec={seg.spec} />;
        if (seg.kind === 'viz-error') return <VizFallback key={i} />;
        if (!seg.text?.trim()) return null;
        return (
          <ReactMarkdown key={i} remarkPlugins={remarkPlugins} rehypePlugins={[rehypeKatex]} components={merged}>
            {seg.text}
          </ReactMarkdown>
        );
      })}
    </>
  );
};
