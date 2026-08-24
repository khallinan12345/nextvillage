// src/components/community-impact/illustrationParser.ts
//
// Extracts and validates an optional <illustration>{json}</illustration>
// block from an AI response. The model supplies only numbers and short
// strings — never markup — so validation here is a whitelist/bounds check,
// not a sanitizer. Anything that fails validation is silently dropped
// (never thrown, never shown to the reader as raw JSON); the surrounding
// text always renders normally either way.

import { SYMBOL_IDS } from './illustrationSymbols';

export interface SceneItem {
  sym: string;
  x: number;
  y: number;
  w?: number;
  face?: 'happy' | 'worried' | 'neutral';
}

export interface Scene {
  caption?: string;
  scene: SceneItem[];
}

const BLOCK_RE = /<illustration>([\s\S]*?)<\/illustration>/i;
const MAX_ITEMS = 10;
const MAX_CAPTION_LEN = 140;
const CANVAS_W = 400;
const CANVAS_H = 240;
const MIN_W = 10;
const MAX_W = 200;

const clampNum = (v: unknown, min: number, max: number): number | null => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(max, Math.max(min, v));
};

const FACE_VALUES = new Set(['happy', 'worried', 'neutral']);

export function validateScene(parsed: unknown): Scene | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.scene)) return null;

  const items: SceneItem[] = [];
  for (const raw of obj.scene as unknown[]) {
    if (items.length >= MAX_ITEMS) break;
    if (typeof raw !== 'object' || raw === null) continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.sym !== 'string' || !SYMBOL_IDS.has(r.sym)) continue;

    const x = clampNum(r.x, 0, CANVAS_W);
    const y = clampNum(r.y, 0, CANVAS_H);
    if (x === null || y === null) continue;

    const item: SceneItem = { sym: r.sym, x, y };

    const w = clampNum(r.w, MIN_W, MAX_W);
    if (w !== null) item.w = w;

    if (typeof r.face === 'string' && FACE_VALUES.has(r.face)) {
      item.face = r.face as SceneItem['face'];
    }

    items.push(item);
  }

  if (items.length === 0) return null;

  const scene: Scene = { scene: items };
  if (typeof obj.caption === 'string' && obj.caption.trim()) {
    scene.caption = obj.caption.trim().slice(0, MAX_CAPTION_LEN);
  }
  return scene;
}

export function extractIllustration(text: string): { text: string; scene: Scene | null } {
  const match = BLOCK_RE.exec(text);
  if (!match) return { text, scene: null };

  const cleanedText = (text.slice(0, match.index) + text.slice(match.index + match[0].length)).trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch {
    return { text: cleanedText, scene: null };
  }

  return { text: cleanedText, scene: validateScene(parsed) };
}
