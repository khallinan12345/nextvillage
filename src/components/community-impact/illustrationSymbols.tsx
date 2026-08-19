// src/components/community-impact/illustrationSymbols.tsx
//
// Fixed library of hand-authored SVG symbols the AI composes scenes from
// (see illustrationParser.ts + SceneIllustration.tsx). The model never
// emits markup — only a symbol id (checked against SYMBOL_IDS below) and a
// position. This file is the entire visual vocabulary; nothing outside this
// whitelist can ever reach the DOM.
//
// Every symbol shares a 0 0 100 100 viewBox and currentColor stroke, so a
// scene inherits its color from CSS and every symbol scales consistently
// when placed via <use width= height=>.

import React from 'react';

export const SYMBOL_IDS: ReadonlySet<string> = new Set([
  'person-stand', 'person-sit', 'person-point', 'person-carry',
  'face-happy', 'face-worried', 'face-neutral',
  'fish', 'pond', 'plant', 'tree', 'apple', 'goat', 'chicken', 'phone', 'house',
  'market-stall', 'coin', 'medical-cross', 'speech-bubble', 'sun', 'drum', 'boat', 'book',
]);

// Default on-canvas width (height follows from the symbol's own aspect
// ratio via preserveAspectRatio) when a scene item doesn't specify one.
export const SYMBOL_DEFAULT_WIDTH: Record<string, number> = {
  'person-stand': 44, 'person-sit': 44, 'person-point': 48, 'person-carry': 50,
  'face-happy': 44, 'face-worried': 44, 'face-neutral': 44,
  fish: 50, pond: 110, plant: 40, tree: 60, apple: 20, goat: 60, chicken: 40, phone: 30, house: 70,
  'market-stall': 80, coin: 30, 'medical-cross': 30, 'speech-bubble': 60, sun: 40, drum: 40, boat: 90, book: 50,
};

const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

// A person's head is always a r=9 circle centered at (50,18) — this lets a
// face-* symbol be composited with the exact same x/y/width as its person,
// no per-pose offset math needed.
export const IllustrationSymbolDefs: React.FC = () => (
  <defs>
    <symbol id="person-stand" viewBox="0 0 100 100">
      <circle cx="50" cy="18" r="9" {...STROKE} />
      <line x1="50" y1="27" x2="50" y2="62" {...STROKE} />
      <line x1="50" y1="36" x2="30" y2="50" {...STROKE} />
      <line x1="50" y1="36" x2="70" y2="50" {...STROKE} />
      <line x1="50" y1="62" x2="32" y2="95" {...STROKE} />
      <line x1="50" y1="62" x2="68" y2="95" {...STROKE} />
    </symbol>

    <symbol id="person-sit" viewBox="0 0 100 100">
      <circle cx="50" cy="22" r="9" {...STROKE} />
      <line x1="50" y1="31" x2="50" y2="55" {...STROKE} />
      <line x1="50" y1="38" x2="35" y2="50" {...STROKE} />
      <line x1="50" y1="38" x2="65" y2="50" {...STROKE} />
      <line x1="50" y1="55" x2="30" y2="60" {...STROKE} />
      <line x1="30" y1="60" x2="28" y2="90" {...STROKE} />
      <line x1="50" y1="55" x2="70" y2="60" {...STROKE} />
      <line x1="70" y1="60" x2="72" y2="90" {...STROKE} />
    </symbol>

    <symbol id="person-point" viewBox="0 0 100 100">
      <circle cx="50" cy="18" r="9" {...STROKE} />
      <line x1="50" y1="27" x2="50" y2="62" {...STROKE} />
      <line x1="50" y1="36" x2="85" y2="30" {...STROKE} />
      <line x1="50" y1="36" x2="35" y2="55" {...STROKE} />
      <line x1="50" y1="62" x2="35" y2="95" {...STROKE} />
      <line x1="50" y1="62" x2="65" y2="95" {...STROKE} />
    </symbol>

    <symbol id="person-carry" viewBox="0 0 100 100">
      <circle cx="50" cy="18" r="9" {...STROKE} />
      <line x1="50" y1="27" x2="50" y2="62" {...STROKE} />
      <line x1="50" y1="36" x2="30" y2="55" {...STROKE} />
      <line x1="50" y1="36" x2="65" y2="50" {...STROKE} />
      <rect x="20" y="55" width="18" height="14" rx="2" {...STROKE} />
      <line x1="50" y1="62" x2="35" y2="95" {...STROKE} />
      <line x1="50" y1="62" x2="65" y2="95" {...STROKE} />
    </symbol>

    <symbol id="face-happy" viewBox="0 0 100 100">
      <circle cx="46" cy="16" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="54" cy="16" r="1.4" fill="currentColor" stroke="none" />
      <path d="M43,21 Q50,26 57,21" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
    </symbol>
    <symbol id="face-worried" viewBox="0 0 100 100">
      <circle cx="46" cy="16" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="54" cy="16" r="1.4" fill="currentColor" stroke="none" />
      <path d="M42,12 L47,14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path d="M58,12 L53,14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path d="M44,23 Q50,19 56,23" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
    </symbol>
    <symbol id="face-neutral" viewBox="0 0 100 100">
      <circle cx="46" cy="16" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="54" cy="16" r="1.4" fill="currentColor" stroke="none" />
      <line x1="45" y1="21" x2="55" y2="21" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
    </symbol>

    <symbol id="fish" viewBox="0 0 100 100">
      <ellipse cx="46" cy="50" rx="30" ry="15" {...STROKE} />
      <polygon points="76,50 94,36 94,64" {...STROKE} />
      <circle cx="28" cy="46" r="2.2" fill="currentColor" stroke="none" />
    </symbol>

    <symbol id="pond" viewBox="0 0 100 100">
      <ellipse cx="50" cy="58" rx="42" ry="20" {...STROKE} />
      <path d="M20,54 Q35,49 50,54 T80,54" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
      <path d="M20,64 Q35,59 50,64 T80,64" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
    </symbol>

    <symbol id="plant" viewBox="0 0 100 100">
      <polygon points="35,80 65,80 60,95 40,95" {...STROKE} />
      <line x1="50" y1="80" x2="50" y2="52" {...STROKE} />
      <path d="M50,62 Q34,52 38,35" fill="none" stroke="currentColor" strokeWidth={5} strokeLinecap="round" />
      <path d="M50,68 Q66,56 60,40" fill="none" stroke="currentColor" strokeWidth={5} strokeLinecap="round" />
    </symbol>

    <symbol id="tree" viewBox="0 0 100 100">
      <circle cx="50" cy="38" r="30" {...STROKE} />
      <rect x="44" y="64" width="12" height="32" rx="2" {...STROKE} />
    </symbol>

    <symbol id="apple" viewBox="0 0 100 100">
      <circle cx="50" cy="58" r="24" {...STROKE} />
      <line x1="50" y1="34" x2="48" y2="20" {...STROKE} />
      <ellipse cx="60" cy="24" rx="10" ry="5" {...STROKE} />
    </symbol>

    <symbol id="goat" viewBox="0 0 100 100">
      <ellipse cx="42" cy="58" rx="24" ry="14" {...STROKE} />
      <circle cx="74" cy="47" r="10" {...STROKE} />
      <line x1="70" y1="39" x2="66" y2="30" {...STROKE} />
      <line x1="78" y1="39" x2="82" y2="30" {...STROKE} />
      <line x1="28" y1="70" x2="26" y2="92" {...STROKE} />
      <line x1="38" y1="72" x2="36" y2="92" {...STROKE} />
      <line x1="50" y1="72" x2="52" y2="92" {...STROKE} />
      <line x1="58" y1="70" x2="60" y2="92" {...STROKE} />
      <line x1="20" y1="54" x2="12" y2="48" {...STROKE} />
    </symbol>

    <symbol id="chicken" viewBox="0 0 100 100">
      <ellipse cx="46" cy="62" rx="20" ry="16" {...STROKE} />
      <circle cx="68" cy="42" r="9" {...STROKE} />
      <polygon points="76,42 86,39 76,46" {...STROKE} />
      <polygon points="64,32 68,24 71,33" {...STROKE} />
      <line x1="40" y1="78" x2="40" y2="92" {...STROKE} />
      <line x1="52" y1="78" x2="52" y2="92" {...STROKE} />
      <line x1="28" y1="50" x2="16" y2="42" {...STROKE} />
      <line x1="28" y1="58" x2="14" y2="56" {...STROKE} />
    </symbol>

    <symbol id="phone" viewBox="0 0 100 100">
      <rect x="34" y="12" width="32" height="76" rx="6" {...STROKE} />
      <circle cx="50" cy="80" r="2.8" fill="currentColor" stroke="none" />
    </symbol>

    <symbol id="house" viewBox="0 0 100 100">
      <polygon points="18,52 50,20 82,52" {...STROKE} />
      <rect x="26" y="52" width="48" height="38" {...STROKE} />
      <rect x="44" y="68" width="14" height="22" {...STROKE} />
      <rect x="60" y="58" width="10" height="10" {...STROKE} />
    </symbol>

    <symbol id="market-stall" viewBox="0 0 100 100">
      <polyline points="15,32 25,20 35,32 45,20 55,32 65,20 75,32 85,20" fill="none" stroke="currentColor" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      <line x1="22" y1="32" x2="22" y2="80" {...STROKE} />
      <line x1="78" y1="32" x2="78" y2="80" {...STROKE} />
      <line x1="15" y1="80" x2="85" y2="80" {...STROKE} />
      <circle cx="38" cy="74" r="5" {...STROKE} />
      <circle cx="52" cy="74" r="5" {...STROKE} />
      <circle cx="66" cy="74" r="5" {...STROKE} />
    </symbol>

    <symbol id="coin" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="30" {...STROKE} />
      <circle cx="50" cy="50" r="20" {...STROKE} />
    </symbol>

    <symbol id="medical-cross" viewBox="0 0 100 100">
      <rect x="40" y="15" width="20" height="70" rx="3" fill="currentColor" stroke="none" />
      <rect x="15" y="40" width="70" height="20" rx="3" fill="currentColor" stroke="none" />
    </symbol>

    <symbol id="speech-bubble" viewBox="0 0 100 100">
      <rect x="12" y="15" width="76" height="48" rx="12" {...STROKE} />
      <polygon points="30,63 24,84 46,63" {...STROKE} />
    </symbol>

    <symbol id="sun" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="18" {...STROKE} />
      <line x1="50" y1="30" x2="50" y2="18" {...STROKE} />
      <line x1="50" y1="70" x2="50" y2="82" {...STROKE} />
      <line x1="70" y1="50" x2="82" y2="50" {...STROKE} />
      <line x1="30" y1="50" x2="18" y2="50" {...STROKE} />
      <line x1="63" y1="37" x2="71" y2="29" {...STROKE} />
      <line x1="37" y1="37" x2="29" y2="29" {...STROKE} />
      <line x1="63" y1="63" x2="71" y2="71" {...STROKE} />
      <line x1="37" y1="63" x2="29" y2="71" {...STROKE} />
    </symbol>

    <symbol id="drum" viewBox="0 0 100 100">
      <rect x="28" y="20" width="44" height="66" rx="5" {...STROKE} />
      <ellipse cx="50" cy="20" rx="22" ry="6" {...STROKE} />
      <line x1="28" y1="42" x2="72" y2="42" {...STROKE} />
      <line x1="28" y1="64" x2="72" y2="64" {...STROKE} />
    </symbol>

    <symbol id="boat" viewBox="0 0 100 100">
      <path d="M8,58 Q50,80 92,58 Q68,48 50,50 Q32,48 8,58 Z" {...STROKE} />
      <line x1="50" y1="50" x2="50" y2="22" {...STROKE} />
      <line x1="50" y1="26" x2="68" y2="32" {...STROKE} />
    </symbol>

    <symbol id="book" viewBox="0 0 100 100">
      <path d="M50,25 Q22,18 14,28 L14,76 Q22,68 50,76 Z" {...STROKE} />
      <path d="M50,25 Q78,18 86,28 L86,76 Q78,68 50,76 Z" {...STROKE} />
      <line x1="50" y1="25" x2="50" y2="76" {...STROKE} />
    </symbol>
  </defs>
);
