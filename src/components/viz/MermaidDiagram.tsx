// src/components/viz/MermaidDiagram.tsx
//
// Draws a Mermaid diagram (flowchart, timeline, mind map, sequence, pie) from code the AI
// coach wrote. Loaded lazily (the Mermaid library is large) so pages without diagrams do not
// pay for it. securityLevel 'strict' makes Mermaid sanitise the output, and vizSpec.ts has
// already refused code containing scripts, click handlers or init directives.

import React, { useEffect, useId, useState } from 'react';

let initialised = false;

const MermaidDiagram: React.FC<{ code: string; alt?: string }> = ({ code, alt }) => {
  const id = 'mmd' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        if (!initialised) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            suppressErrorRendering: true,
            theme: 'base',
            fontFamily: 'inherit',
            flowchart: { htmlLabels: false, curve: 'basis' },
            themeVariables: {
              primaryColor: '#eef2ff', primaryBorderColor: '#4f46e5', primaryTextColor: '#1e1b4b',
              lineColor: '#475569', secondaryColor: '#fffbeb', tertiaryColor: '#ecfdf5',
              pie1: '#4f46e5', pie2: '#f59e0b', pie3: '#059669', pie4: '#e11d48',
              pie5: '#0284c7', pie6: '#7c3aed', pie7: '#ea580c', pie8: '#0d9488',
            },
          });
          initialised = true;
        }
        const out = await mermaid.render(id, code);
        if (!cancelled) setSvg(out.svg);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [code, id]);

  if (failed) {
    return <p className="text-xs italic text-slate-500">(This diagram could not be drawn. The explanation still applies.)</p>;
  }
  if (!svg) return <p className="text-sm text-slate-500">Drawing diagram…</p>;
  return (
    <div
      className="overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto"
      role="img"
      aria-label={alt ?? 'diagram'}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

export default MermaidDiagram;
