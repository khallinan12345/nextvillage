// src/components/viz/markdownTableSpec.ts
//
// Pure detection/parsing for a GFM-style pipe table ("| a | b |" header row, "|---|---|"
// separator row, then body rows) inside a block of lines. No React here (see MarkdownTable.tsx
// for the renderer) so this stays a plain, unit-tested function.

const SEPARATOR_RE = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/;

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map(c => c.trim());
}

export function parseMarkdownTable(lines: string[]): { header: string[]; rows: string[][] } | null {
  if (lines.length < 2 || !lines[0].includes('|') || !SEPARATOR_RE.test(lines[1].trim())) return null;
  const header = splitRow(lines[0]);
  const rows = lines.slice(2).filter(l => l.includes('|')).map(splitRow);
  if (!rows.length) return null;
  return { header, rows };
}
