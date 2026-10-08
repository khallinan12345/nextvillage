import { describe, it, expect } from 'vitest';
import {
  SYSTEM_PROMPT,
  buildScoringPrompt,
  buildTranscriptText,
  hasEnoughContent,
  parseScores,
  parseTranscript,
} from './anchorScoring.js';

describe('parseTranscript', () => {
  it('accepts an array or a JSON string and drops empty or malformed messages', () => {
    const msgs = [
      { role: 'assistant', content: 'Hello', timestamp: '2026-03-01T10:00:00Z' },
      { role: 'user', content: '  Make my prompt better  ' },
      { role: 'user', content: '   ' },
      null,
      { role: 'user' },
    ];
    expect(parseTranscript(msgs)).toEqual([
      { role: 'assistant', content: 'Hello' },
      { role: 'user', content: 'Make my prompt better' },
    ]);
    expect(parseTranscript(JSON.stringify(msgs))).toHaveLength(2);
    expect(parseTranscript('not json')).toEqual([]);
    expect(parseTranscript(null)).toEqual([]);
  });
});

describe('hasEnoughContent', () => {
  it('needs at least two learner messages', () => {
    expect(hasEnoughContent([{ role: 'user', content: 'a' }])).toBe(false);
    expect(hasEnoughContent([{ role: 'assistant', content: 'a' }, { role: 'assistant', content: 'b' }])).toBe(false);
    expect(hasEnoughContent([{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }])).toBe(true);
  });
});

describe('buildTranscriptText', () => {
  it('labels turns, keeps learner turns long and shortens facilitator turns', () => {
    const text = buildTranscriptText([
      { role: 'assistant', content: 'x'.repeat(1000) },
      { role: 'user', content: 'y'.repeat(1000) },
    ]);
    expect(text).toContain('[FACILITATOR]: ');
    expect(text).toContain('[LEARNER]: ');
    expect(text.match(/x/g)).toHaveLength(400);
    expect(text.match(/y/g)).toHaveLength(1000);
  });

  it('caps the total length', () => {
    const many = Array.from({ length: 100 }, () => ({ role: 'user', content: 'z'.repeat(1400) }));
    const text = buildTranscriptText(many);
    expect(text.length).toBeLessThan(25000);
    expect(text).toContain('[conversation continues]');
  });
});

describe('blind scoring', () => {
  it('never tells the scorer what kind of attempt it is or that another exists', () => {
    const prompt = `${SYSTEM_PROMPT}\n${buildScoringPrompt('[LEARNER]: hello')}`.toLowerCase();
    for (const word of ['original', 'revisit', 'checkpoint', 'baseline', 'earlier', 'later', 'second attempt', 'first attempt', 'previous', 'compare']) {
      expect(prompt).not.toContain(word);
    }
  });

  it('builds identical prompts for identical transcripts regardless of source', () => {
    const t = '[LEARNER]: make it clearer';
    expect(buildScoringPrompt(t)).toBe(buildScoringPrompt(t));
  });
});

describe('parseScores', () => {
  const reply = {
    cognitive_score: 62, cognitive_evidence: ['asked for a step-by-step answer'],
    critical_thinking_score: 48.456, critical_thinking_evidence: ['noticed the answer was too general'],
    problem_solving_score: null, problem_solving_evidence: [],
    creativity_score: 140, creativity_evidence: ['used a fishing example from the creek', 'a', 'b', 'c'],
  };

  it('reads a plain JSON reply', () => {
    const { scores, evidence } = parseScores(JSON.stringify(reply));
    expect(scores.cognitive).toBe(62);
    expect(scores.critical_thinking).toBe(48.46);
    expect(scores.problem_solving).toBeNull();
    expect(evidence.cognitive).toEqual(['asked for a step-by-step answer']);
  });

  it('clamps out-of-range scores and limits evidence', () => {
    const { scores, evidence } = parseScores(JSON.stringify(reply));
    expect(scores.creativity).toBe(100);
    expect(evidence.creativity).toHaveLength(3);
  });

  it('tolerates code fences and surrounding text', () => {
    const fenced = 'Here you go:\n```json\n' + JSON.stringify(reply) + '\n```\nDone.';
    expect(parseScores(fenced).scores.cognitive).toBe(62);
  });

  it('turns non-numeric scores into null and throws when there is no JSON', () => {
    const { scores } = parseScores('{"cognitive_score":"high","critical_thinking_score":-5}');
    expect(scores.cognitive).toBeNull();
    expect(scores.critical_thinking).toBe(0);
    expect(() => parseScores('I cannot score this.')).toThrow();
  });
});
