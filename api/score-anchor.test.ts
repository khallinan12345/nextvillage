import { describe, it, expect, vi, beforeEach } from 'vitest';

// The route talks to Supabase and Anthropic; both are replaced here so the
// selection, idempotency and blindness logic can be checked without a network.

type Row = Record<string, unknown>;
const state = {
  attempts: [] as Row[],
  done: [] as Row[],
  upserts: [] as Row[],
  profiles: [] as Row[],
  orgs: [] as Row[],
};

function chain(result: () => unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'not', 'order', 'limit', 'in']) q[m] = () => q;
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
  return q;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'anchor_attempts') return chain(() => ({ data: state.attempts, error: null }));
      if (table === 'profiles') return chain(() => ({ data: state.profiles, error: null }));
      if (table === 'organizations') return chain(() => ({ data: state.orgs, error: null }));
      return {
        ...(chain(() => ({ data: state.done, error: null })) as object),
        upsert: (row: Row) => {
          state.upserts.push(row);
          return Promise.resolve({ error: null });
        },
      };
    },
  }),
}));
vi.mock('../lib/api-cost-logger.js', () => ({ logApiCost: vi.fn() }));

const REPLY = JSON.stringify({
  cognitive_score: 60, cognitive_evidence: ['a'],
  critical_thinking_score: 50, critical_thinking_evidence: ['b'],
  problem_solving_score: 55, problem_solving_evidence: ['c'],
  creativity_score: 45, creativity_evidence: ['d'],
});

let modelRequests: { system: string; user: string; body: Row }[] = [];

beforeEach(() => {
  state.attempts = [];
  state.done = [];
  state.upserts = [];
  state.profiles = [];
  state.orgs = [];
  modelRequests = [];
  process.env.CRON_SECRET = 'secret';
  process.env.SUPABASE_URL = 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  process.env.ANTHROPIC_API_KEY = 'a';
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    modelRequests.push({ system: body.system, user: body.messages[0].content, body });
    return { ok: true, status: 200, json: async () => ({ content: [{ text: REPLY }], usage: { input_tokens: 1, output_tokens: 1 } }) };
  }));
});

function mockRes() {
  const res: { statusCode: number; body: unknown; status: (c: number) => typeof res; json: (b: unknown) => typeof res } = {
    statusCode: 200,
    body: null,
    status(c) { res.statusCode = c; return res; },
    json(b) { res.body = b; return res; },
  };
  return res;
}

const talk = (text: string) => [
  { role: 'assistant', content: 'Welcome' },
  { role: 'user', content: text },
  { role: 'assistant', content: 'Try again' },
  { role: 'user', content: `${text} with a clearer goal` },
];

async function run(headers: Record<string, string> = { authorization: 'Bearer secret' }, query: Record<string, string> = {}) {
  const { default: handler } = await import('./score-anchor');
  const res = mockRes();
  await handler({ headers, query } as never, res as never);
  return res;
}

describe('score-anchor', () => {
  it('rejects requests without the cron secret', async () => {
    const res = await run({});
    expect(res.statusCode).toBe(401);
    expect(modelRequests).toHaveLength(0);
  });

  it('scores a checkpoint attempt once, with no temperature and medium effort', async () => {
    state.attempts = [{ id: 'a1', user_id: 'u1', kind: 'checkpoint', transcript: talk('fix my prompt'), original_transcript: null }];
    const res = await run();
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ scored: 1, insufficient_transcript: 0, errors: [] });
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0]).toMatchObject({ attempt_id: 'a1', subject: 'attempt', cognitive_score: 60, scorer_model: 'claude-sonnet-5-5' });
    expect(modelRequests[0].body.model).toBe('claude-sonnet-5-5');
    expect(modelRequests[0].body).not.toHaveProperty('temperature');
    expect(modelRequests[0].body.output_config).toEqual({ effort: 'medium' });
  });

  it('keeps the original Oloibiri prompt for Oloibiri learners and uses a neutral one for everyone else', async () => {
    const OLOIBIRI = 'a1b2c3d4-0001-0001-0001-000000000001';
    state.attempts = [
      { id: 'o1', user_id: 'u1', kind: 'checkpoint', transcript: talk('x'), original_transcript: null },
      { id: 'k1', user_id: 'u2', kind: 'checkpoint', transcript: talk('y'), original_transcript: null },
    ];
    state.profiles = [{ id: 'u1', organization_id: OLOIBIRI }, { id: 'u2', organization_id: 'maji' }];
    state.orgs = [
      { id: OLOIBIRI, name: 'Davidson AI Futures Lab', city: 'Oloibiri', country: 'Nigeria' },
      { id: 'maji', name: 'Maji Mazuri', city: 'Nairobi', country: 'Kenya' },
    ];
    await run();
    expect(modelRequests[0].system).toContain('Oloibiri, Nigeria, a rural community with a new solar mini-grid');
    expect(modelRequests[0].system).toContain('Nigerian English or Pidgin');
    expect(modelRequests[1].system).not.toContain('Oloibiri');
    expect(modelRequests[1].system).not.toContain('solar mini-grid');
    expect(modelRequests[1].system).toContain('Maji Mazuri in Nairobi, Kenya');
    expect(modelRequests[1].system).toContain('Score four dimensions from 0 to 100');
  });

  it('skips transcripts that already have a score', async () => {
    state.attempts = [{ id: 'a1', user_id: 'u1', kind: 'checkpoint', transcript: talk('x'), original_transcript: null }];
    state.done = [{ attempt_id: 'a1', subject: 'attempt' }];
    const res = await run();
    expect(res.body).toMatchObject({ scored: 0 });
    expect(modelRequests).toHaveLength(0);
  });

  it('scores both transcripts of a revisit with the same prompt and nothing that tells them apart', async () => {
    state.attempts = [{ id: 'r1', user_id: 'u1', kind: 'revisit', transcript: talk('same words'), original_transcript: talk('same words') }];
    await run();
    expect(modelRequests).toHaveLength(2);
    expect(modelRequests[0].system).toBe(modelRequests[1].system);
    expect(modelRequests[0].user).toBe(modelRequests[1].user);
    expect(state.upserts.map((u) => u.subject).sort()).toEqual(['attempt', 'original']);
  });

  it('records an empty row for a transcript with too little learner input, and does not call the model', async () => {
    state.attempts = [{ id: 'r2', user_id: 'u1', kind: 'revisit', transcript: talk('enough words here'), original_transcript: [{ role: 'user', content: 'hi' }] }];
    const res = await run();
    expect(res.body).toMatchObject({ scored: 1, insufficient_transcript: 1 });
    expect(modelRequests).toHaveLength(1);
    const empty = state.upserts.find((u) => u.subject === 'original');
    expect(empty).toMatchObject({ cognitive_score: null, creativity_score: null });
    expect(empty?.evidence).toMatchObject({ reason: 'insufficient_transcript' });
  });

  it('respects the limit', async () => {
    state.attempts = Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, user_id: 'u', kind: 'checkpoint', transcript: talk(`t${i}`), original_transcript: null }));
    const res = await run({ authorization: 'Bearer secret' }, { limit: '2' });
    expect(res.body).toMatchObject({ scored: 2, remaining: 3 });
  });
});
