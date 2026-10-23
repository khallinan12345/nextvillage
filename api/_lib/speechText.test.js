import { describe, it, expect } from 'vitest';
import { stripForSpeech, spokenVersion } from './speechText.js';

describe('stripForSpeech', () => {
  it('removes code, links, lists, tables and markdown', () => {
    const t = 'Here is **bold** text.\n```js\nconst a = 1;\n```\nSee [the guide](https://x.org/a) or https://y.org now.\n- one\n- two\n1. first\n| a | b |\n# Heading\nDone.';
    const out = stripForSpeech(t);
    expect(out).toBe('Here is bold text. See the guide or now. Heading Done.');
  });
  it('drops an unterminated code block', () => {
    expect(stripForSpeech('Try this:\n```python\nprint(1)')).toBe('Try this:');
  });
  it('handles empty and non-string input', () => {
    expect(stripForSpeech(null)).toBe('');
    expect(stripForSpeech('')).toBe('');
  });
});

describe('spokenVersion', () => {
  it('keeps at most three sentences', () => {
    expect(spokenVersion('One. Two. Three. Four. Five.')).toBe('One. Two. Three.');
  });
  it('stops before a sentence would push it over the character limit', () => {
    const long = 'a'.repeat(200);
    const out = spokenVersion(`${long}. ${long}.`, { maxChars: 320 });
    expect(out).toBe(`${long}.`);
  });
  it('cuts one very long sentence at a word boundary', () => {
    const out = spokenVersion('word '.repeat(200), { maxChars: 50 });
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out.endsWith('.')).toBe(true);
  });
  it('returns nothing for a reply that is only code', () => {
    expect(spokenVersion('```\nx\n```')).toBe('');
  });
});
