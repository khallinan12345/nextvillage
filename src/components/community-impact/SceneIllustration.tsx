// src/components/community-impact/SceneIllustration.tsx
//
// Renders a validated Scene (see illustrationParser.ts) as a small SVG
// composed entirely from the fixed symbol library — every element on
// screen comes from illustrationSymbols.tsx, never from the model's own
// markup. Self-contained: carries its own <defs> so it works anywhere
// without a global mount point.

import React from 'react';
import { IllustrationSymbolDefs, SYMBOL_DEFAULT_WIDTH } from './illustrationSymbols';
import { Scene } from './illustrationParser';

const CANVAS_W = 400;
const CANVAS_H = 240;

export const SceneIllustration: React.FC<{ scene: Scene }> = ({ scene }) => (
  <div className="my-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
    <svg
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      className="mx-auto w-full max-w-xs text-gray-700"
      role="img"
      aria-label={scene.caption || 'Illustration'}
    >
      <IllustrationSymbolDefs />
      {scene.scene.map((item, i) => {
        const w = item.w ?? SYMBOL_DEFAULT_WIDTH[item.sym] ?? 50;
        return (
          <g key={i}>
            <use href={`#${item.sym}`} x={item.x - w / 2} y={item.y - w / 2} width={w} height={w} />
            {item.face && (
              <use href={`#face-${item.face}`} x={item.x - w / 2} y={item.y - w / 2} width={w} height={w} />
            )}
          </g>
        );
      })}
    </svg>
    {scene.caption && (
      <p className="mt-1 text-center text-xs italic text-gray-500">{scene.caption}</p>
    )}
  </div>
);
