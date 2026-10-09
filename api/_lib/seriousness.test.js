import { describe, it, expect } from 'vitest';
import {
  buildJudgePrompt,
  buildReport,
  computeSignals,
  inWindow,
  isGibberish,
  parseJudgement,
  parseMessages,
  sampleMessages,
  SYSTEM_PROMPT,
  wordCount,
} from './seriousness.js';

const T0 = Date.parse('2026-09-10T10:00:00Z');
const msg = (role, content, minutes = 0) => ({ role, content, ts: T0 + minutes * 60000 });

describe('isGibberish', () => {
  it('flags keyboard mash, repeated characters and mostly non-letters', () => {
    expect(isGibberish('asdfghjkl qwrtpsdf')).toBe(true);
    expect(isGibberish('aaaaaaaaaa')).toBe(true);
    expect(isGibberish('12345 6789 !!!!')).toBe(true);
  });
  it('leaves real writing alone, including short words, Pidgin and misspellings', () => {
    expect(isGibberish('ok')).toBe(false);
    expect(isGibberish('I no sabi wetin dem dey talk')).toBe(false);
    expect(isGibberish('i wnat to stor fish wit out lite')).toBe(false);
  });
});

describe('parseMessages and inWindow', () => {
  it('parses text, keeps timestamps, and limits to the month', () => {
    const raw = JSON.stringify([
      { role: 'assistant', content: 'Hello', timestamp: '2026-09-10T10:00:00Z' },
      { role: 'user', content: 'my answer', timestamp: '2026-09-10T10:01:00Z' },
      { role: 'user', content: 'too early', timestamp: '2026-08-30T10:00:00Z' },
      { role: 'user', content: 'no stamp' },
      { role: 'user', content: '  ' },
    ]);
    const msgs = parseMessages(raw);
    expect(msgs).toHaveLength(4);
    const start = Date.parse('2026-09-01T00:00:00Z');
    const end = Date.parse('2026-10-01T00:00:00Z');
    expect(inWindow(msgs, start, end).map((m) => m.content)).toEqual(['Hello', 'my answer']);
    expect(parseMessages('nope')).toEqual([]);
  });
});

describe('computeSignals', () => {
  it('describes effort: length, short replies, repeats, random typing, days and time on task', () => {
    const convo = [
      msg('assistant', 'What do you want to ask?', 0),
      msg('user', 'how do I keep fish fresh for six hours at the market', 1),
      msg('assistant', 'Good. What could make it clearer?', 2),
      msg('user', 'ok', 3),
      msg('user', 'ok', 4),
      msg('user', 'asdfghjkl qwrtpsdf', 5),
    ];
    const s = computeSignals([convo]);
    expect(s.sessions).toBe(1);
    expect(s.learnerMessages).toBe(4);
    expect(s.shortShare).toBe(0.75); // 'ok', 'ok' and the two-word mash
    expect(s.duplicateShare).toBe(0.25);
    expect(s.gibberishShare).toBe(0.25);
    expect(s.activeDays).toBe(1);
    expect(s.minutesActive).toBe(5);
    expect(s.medianWords).toBeGreaterThan(0);
  });

  it('counts a long pause as a break, not time on task', () => {
    const convo = [msg('user', 'first thought here', 0), msg('user', 'second thought here', 120)];
    expect(computeSignals([convo]).minutesActive).toBe(10);
  });

  it('ignores conversations with no learner messages', () => {
    expect(computeSignals([[msg('assistant', 'hello', 0)]]).sessions).toBe(0);
  });
});

describe('sampleMessages', () => {
  it('returns everything when small and an evenly spread sample when large, with the question asked', () => {
    const convo = [msg('assistant', 'Q?', 0), msg('user', 'a1', 1)];
    expect(sampleMessages([convo])[0]).toMatchObject({ question: 'Q?', answer: 'a1' });
    const big = Array.from({ length: 100 }, (_, i) => msg('user', `answer ${i}`, i));
    const s = sampleMessages([big], 14);
    expect(s).toHaveLength(14);
    expect(s[0].answer).toBe('answer 0');
    expect(s[13].answer).toBe('answer 99');
  });
});

describe('judging prompt', () => {
  it('never contains a name and asks for neutral, non-judgemental reasons about effort only', () => {
    const p = SYSTEM_PROMPT.toLowerCase();
    expect(p).toContain('do not penalize spelling');
    expect(p).toContain('no names');
    const user = buildJudgePrompt(
      { sessions: 3, learnerMessages: 20, medianWords: 6, shortShare: 0.1, duplicateShare: 0, gibberishShare: 0, activeDays: 4 },
      [{ question: 'Q?', answer: 'my reply' }],
    );
    expect(user).toContain('Replies: 20');
    expect(user).toContain('my reply');
  });

  it('parses a rating and rejects anything unexpected', () => {
    expect(parseJudgement('{"rating":"mixed","reason":"Some real effort, many one-word answers."}')).toEqual({
      rating: 'mixed',
      reason: 'Some real effort, many one-word answers.',
    });
    expect(parseJudgement('```json\n{"rating":"serious","reason":"ok"}\n```').rating).toBe('serious');
    expect(() => parseJudgement('{"rating":"great"}')).toThrow();
    expect(() => parseJudgement('no json here')).toThrow();
  });
});

describe('buildReport', () => {
  const rows = [
    { name: 'Ada <b>', rating: 'not_serious', reason: 'Mostly one-word replies.', previous: 'serious' },
    { name: 'Bola', rating: 'mixed', reason: 'Some effort.', previous: 'mixed' },
    { name: 'Chidi', rating: 'serious', reason: 'Engaged throughout.', previous: null },
    { name: 'Dayo', rating: 'insufficient', reason: '', previous: null },
  ];

  it('groups learners, shows change from last month, and escapes names', () => {
    const r = buildReport({ monthLabel: 'September 2026', rows, noActivityCount: 40 });
    expect(r.counts).toEqual({ serious: 1, mixed: 1, not_serious: 1, insufficient: 1 });
    expect(r.subject).toBe('Learner effort report, September 2026: 2 to check in with, 1 serious');
    expect(r.html).toContain('Ada &lt;b&gt;');
    expect(r.html).not.toContain('Ada <b>');
    expect(r.html).toContain('(last month: serious effort)');
    expect(r.html).not.toContain('(last month: mixed effort)');
    expect(r.text).toContain('WORTH A CHECK-IN: low effort');
    expect(r.text).toContain('40 enrolled learners had no sessions');
  });

  it('says it is a prompt for a conversation, not a verdict', () => {
    const r = buildReport({ monthLabel: 'September 2026', rows, noActivityCount: 0 });
    expect(r.text).toContain('not as a verdict');
    expect(r.html).toContain('prompt for a conversation');
  });

  it('omits empty groups', () => {
    const r = buildReport({ monthLabel: 'September 2026', rows: [rows[2]], noActivityCount: 0 });
    expect(r.html).not.toContain('low effort (');
    expect(r.html).toContain('Serious effort (1)');
  });
});

describe('wordCount', () => {
  it('counts words', () => {
    expect(wordCount('  one two  three ')).toBe(3);
    expect(wordCount('')).toBe(0);
  });
});
