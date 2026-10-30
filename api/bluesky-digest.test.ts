import { describe, it, expect } from 'vitest';
import { parseDrafts } from './bluesky-digest';

// Both models are asked for a bare JSON array, but either may wrap it in
// markdown fences or return the wrong shape; the digest must cope with the
// first and fail loudly (so the email notes it) on the second.

describe('parseDrafts', () => {
  const rows = [{ index: 0, angle: 'community ownership', draft: 'Nice post.' }];

  it('parses a bare JSON array', () => {
    expect(parseDrafts(JSON.stringify(rows))).toEqual(rows);
  });

  it('strips markdown fences', () => {
    expect(parseDrafts('```json\n' + JSON.stringify(rows) + '\n```')).toEqual(rows);
  });

  it('rejects an object that is not an array', () => {
    expect(() => parseDrafts('{"drafts": []}')).toThrow('JSON array');
  });

  it('rejects text that is not JSON', () => {
    expect(() => parseDrafts('Here are your drafts:')).toThrow();
  });
});
