import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./_lib/requireUser.js', () => ({ requireUser: vi.fn(async () => ({ id: 'user-1' })) }));
vi.mock('./_lib/youngLearner.js', () => ({ fetchCallerIsYoung: vi.fn(async () => true) }));

import handler from './pidgin-translate';

function makeRes() {
  const res: any = { statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string> };
  res.setHeader = (k: string, v: string) => { res.headers[k] = v; };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: unknown) => { res.body = b; return res; };
  return res;
}

describe('pidgin-translate for under-13 learners (Anthropic only)', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    delete process.env.GROQ_API_KEY;
    delete process.env.VITE_GROQ_API_KEY;
  });

  it('sends the system prompt as a top-level field, not as a message', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ content: [{ text: 'Mornin o' }] }) }));
    vi.stubGlobal('fetch', fetchMock);

    const res = makeRes();
    await handler({ method: 'POST', body: { text: 'Good morning' }, headers: {} } as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ translation: 'Mornin o' });

    const sent = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(typeof sent.system).toBe('string');
    expect(sent.messages.every((m: { role: string }) => m.role === 'user' || m.role === 'assistant')).toBe(true);
    expect(sent.temperature).toBeUndefined();
  });
});
