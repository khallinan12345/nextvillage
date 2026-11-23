import { describe, it, expect } from 'vitest';
import { parseMarkdownTable } from './markdownTableSpec';

describe('parseMarkdownTable', () => {
  it('parses a standard piped table', () => {
    const lines = [
      '| Data type | Example value | Why it helps |',
      '|-----------|---------------|---------------|',
      '| Racket weight | 300 g | Shows feel |',
      '| Swing speed | 45 mph | Relates to power |',
    ];
    const table = parseMarkdownTable(lines);
    expect(table).toEqual({
      header: ['Data type', 'Example value', 'Why it helps'],
      rows: [
        ['Racket weight', '300 g', 'Shows feel'],
        ['Swing speed', '45 mph', 'Relates to power'],
      ],
    });
  });

  it('parses a table without leading/trailing pipes', () => {
    const lines = ['a | b', '---|---', '1 | 2'];
    expect(parseMarkdownTable(lines)).toEqual({ header: ['a', 'b'], rows: [['1', '2']] });
  });

  it('accepts alignment colons in the separator', () => {
    const lines = ['| a | b |', '|:--|--:|', '| 1 | 2 |'];
    expect(parseMarkdownTable(lines)).toEqual({ header: ['a', 'b'], rows: [['1', '2']] });
  });

  it('rejects plain prose, even with a stray pipe', () => {
    expect(parseMarkdownTable(['This | that is not a table', 'just more text'])).toBeNull();
  });

  it('rejects a bullet list even if dashes look table-ish', () => {
    expect(parseMarkdownTable(['- first item', '- second item'])).toBeNull();
  });

  it('rejects a header with no body rows', () => {
    expect(parseMarkdownTable(['| a | b |', '|---|---|'])).toBeNull();
  });
});
