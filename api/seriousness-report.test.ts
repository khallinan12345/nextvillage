import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;

const store: Record<string, Row[]> = {
  profiles: [], dashboard: [], ai_playground_chats: [], anchor_attempts: [],
  seriousness_reviews: [], seriousness_report_runs: [], report_recipients: [],
};

function builder(table: string) {
  const filters: { col: string; val: unknown }[] = [];
  let range: [number, number] | null = null;
  let single = false;
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'in', 'gte', 'lt', 'not', 'neq', 'order', 'limit']) q[m] = () => q;
  q.eq = (col: string, val: unknown) => { filters.push({ col, val }); return q; };
  q.range = (from: number, to: number) => { range = [from, to]; return q; };
  q.maybeSingle = () => { single = true; return q; };
  q.upsert = (row: Row) => {
    const keys = table === 'seriousness_reviews' ? ['user_id', 'month'] : ['month'];
    const i = store[table].findIndex((r) => keys.every((k) => r[k] === row[k]));
    if (i >= 0) store[table][i] = row; else store[table].push(row);
    return Promise.resolve({ error: null });
  };
  q.then = (resolve: (v: unknown) => unknown) => {
    let rows = store[table].filter((r) => filters.every((f) => !(f.col in r) || r[f.col] === f.val));
    if (range) rows = rows.slice(range[0], range[1] + 1);
    return Promise.resolve(single ? { data: rows[0] ?? null, error: null } : { data: rows, error: null }).then(resolve);
  };
  return q;
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => builder(t) }) }));
vi.mock('../lib/api-cost-logger.js', () => ({ logApiCost: vi.fn() }));

const MAIN_ORG = 'a1b2c3d4-0001-0001-0001-000000000001';
let anthropicCalls: { system: string; user: string; body: Row }[] = [];
let resendCalls: Row[] = [];
let anthropicStatus = 200;

const chat = (n: number, text: (i: number) => string) =>
  JSON.stringify(Array.from({ length: n * 2 }, (_, i) => ({
    role: i % 2 === 0 ? 'assistant' : 'user',
    content: i % 2 === 0 ? 'What do you think?' : text(i),
    timestamp: new Date(Date.UTC(2026, 8, 10 + (i % 5), 10, i)).toISOString(),
  })));

beforeEach(() => {
  for (const k of Object.keys(store)) store[k] = [];
  anthropicCalls = [];
  resendCalls = [];
  anthropicStatus = 200;
  process.env.CRON_SECRET = 'secret';
  process.env.RESEND_API_KEY = 'r';
  process.env.ANTHROPIC_API_KEY = 'a';
  process.env.SUPABASE_URL = 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  store.profiles = [
    { id: 'ada', name: 'Ada', organization_id: MAIN_ORG, city: 'Oloibiri' },
    { id: 'bola', name: 'Bola', organization_id: MAIN_ORG, city: 'Oloibiri' },
    { id: 'chidi', name: 'Chidi', organization_id: MAIN_ORG, city: 'Oloibiri' },
    { id: 'far', name: 'Far Away', organization_id: 'some-other-org', city: 'Dayton' },
  ];
  store.dashboard = [
    { user_id: 'ada', chat_history: chat(10, (i) => `my careful answer number ${i} about keeping fish fresh in the market`) },
    { user_id: 'bola', chat_history: chat(3, () => 'short answer here') },
    { user_id: 'far', chat_history: chat(10, () => 'a long answer from another site entirely') },
  ];
  store.report_recipients = [
    { report: 'seriousness_report', email: 'one@example.org', active: true },
    { report: 'seriousness_report', email: 'two@example.org', active: true },
    { report: 'seriousness_report', email: 'off@example.org', active: false },
    { report: 'other_report', email: 'x@example.org', active: true },
  ];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    if (url.includes('anthropic')) {
      anthropicCalls.push({ system: body.system, user: body.messages[0].content, body });
      if (anthropicStatus !== 200) return { ok: false, status: anthropicStatus, json: async () => ({ error: 'down' }) };
      return { ok: true, status: 200, json: async () => ({ content: [{ text: '{"rating":"serious","reason":"Real effort throughout."}' }], usage: { input_tokens: 1, output_tokens: 1 } }) };
    }
    resendCalls.push(body);
    return { ok: true, status: 200, text: async () => '' };
  }));
});

function mockRes() {
  const res: { statusCode: number; body: Record<string, unknown>; status: (c: number) => typeof res; json: (b: Record<string, unknown>) => typeof res } = {
    statusCode: 200, body: {},
    status(c) { res.statusCode = c; return res; },
    json(b) { res.body = b; return res; },
  };
  return res;
}

async function run(query: Record<string, string> = { month: '2026-09' }, headers: Record<string, string> = { authorization: 'Bearer secret' }) {
  const { default: handler } = await import('./seriousness-report');
  const res = mockRes();
  await handler({ headers, query } as never, res as never);
  return res;
}

describe('seriousness-report', () => {
  it('rejects requests without the cron secret', async () => {
    expect((await run({}, {})).statusCode).toBe(401);
    expect(anthropicCalls).toHaveLength(0);
  });

  it('reviews learners at the site, skips other sites and no-activity learners, and emails the active recipients once', async () => {
    const res = await run();
    expect(res.body).toMatchObject({ complete: true, emailed: true, recipients: 2, judged: 1, insufficient: 1, pending: 0 });
    const reviews = store.seriousness_reviews;
    expect(reviews.map((r) => r.user_id).sort()).toEqual(['ada', 'bola']);
    expect(reviews.find((r) => r.user_id === 'ada')).toMatchObject({ rating: 'serious', month: '2026-09-01', model: 'claude-sonnet-5-5' });
    expect(reviews.find((r) => r.user_id === 'bola')).toMatchObject({ rating: 'insufficient', model: null });

    expect(anthropicCalls).toHaveLength(1); // only Ada had enough replies to judge
    expect(anthropicCalls[0].body.model).toBe('claude-sonnet-5-5');
    expect(anthropicCalls[0].body).not.toHaveProperty('temperature');
    expect(anthropicCalls[0].user).not.toMatch(/Ada|Bola|Chidi/); // names never reach the model

    expect(resendCalls).toHaveLength(1);
    expect(resendCalls[0].to).toEqual(['one@example.org', 'two@example.org']);
    expect(resendCalls[0].from).toContain('nextvillage.community');
    expect(String(resendCalls[0].subject)).toContain('September 2026');
    expect(String(resendCalls[0].html)).toContain('Ada');
    expect(store.seriousness_report_runs).toHaveLength(1);
  });

  it('does not rate or email again for a month already done', async () => {
    await run();
    anthropicCalls = [];
    resendCalls = [];
    const res = await run();
    expect(res.body).toMatchObject({ emailed: false, note: 'already sent' });
    expect(anthropicCalls).toHaveLength(0);
    expect(resendCalls).toHaveLength(0);
  });

  it('can rate and store without emailing (send=0), then email later', async () => {
    const first = await run({ month: '2026-09', send: '0' });
    expect(first.body).toMatchObject({ complete: true, emailed: false });
    expect(store.seriousness_reviews).toHaveLength(2);
    expect(resendCalls).toHaveLength(0);
    const second = await run({ month: '2026-09' });
    expect(second.body).toMatchObject({ emailed: true });
    expect(anthropicCalls).toHaveLength(1); // not re-judged
  });

  it('holds the email back if the model fails, so a half-finished report is never sent', async () => {
    anthropicStatus = 500;
    const res = await run();
    expect(res.body).toMatchObject({ complete: false, emailed: false, pending: 1 });
    expect((res.body.errors as string[]).length).toBe(1);
    expect(resendCalls).toHaveLength(0);
    anthropicStatus = 200;
    const retry = await run();
    expect(retry.body).toMatchObject({ complete: true, emailed: true });
  });

  it('does not email when nobody is set to receive it', async () => {
    store.report_recipients = [];
    const res = await run();
    expect(res.body).toMatchObject({ complete: true, emailed: false, note: 'no active recipients' });
    expect(resendCalls).toHaveLength(0);
  });

  it('defaults to the previous month', async () => {
    const res = await run({});
    const key = (res.body as { month: string }).month;
    const now = new Date();
    const expected = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
    expect(key).toBe(expected);
  });
});
