import { describe, it, expect } from 'vitest';
import { isYoungLearner, peerChatBlocked } from './youngLearner.js';

const NOW = new Date('2026-10-14T00:00:00Z');
const young10 = { learner_age_min: 10 };
const adults = { learner_age_min: 17 };

describe('isYoungLearner', () => {
  it('uses birth year when present', () => {
    expect(isYoungLearner({ role: 'student', birth_year: 2015 }, adults, NOW)).toBe(true);
    expect(isYoungLearner({ role: 'student', birth_year: 2013 }, adults, NOW)).toBe(true);   // could still be 12
    expect(isYoungLearner({ role: 'student', birth_year: 2012 }, young10, NOW)).toBe(false);
  });
  it('defaults by organization minimum age when birth year is blank', () => {
    expect(isYoungLearner({ role: 'student', birth_year: null }, young10, NOW)).toBe(true);
    expect(isYoungLearner({ role: 'student', birth_year: null }, adults, NOW)).toBe(false);
    expect(isYoungLearner({ role: 'student', birth_year: null }, { learner_age_min: null }, NOW)).toBe(false);
    expect(isYoungLearner({ role: 'student', birth_year: null }, null, NOW)).toBe(false);
  });
  it('never treats staff as young', () => {
    expect(isYoungLearner({ role: 'leader', birth_year: 2016 }, young10, NOW)).toBe(false);
    expect(isYoungLearner({ role: 'platform_administrator', birth_year: null }, young10, NOW)).toBe(false);
  });
});

describe('peerChatBlocked', () => {
  it('blocks young learners by default', () => {
    expect(peerChatBlocked({ role: 'student', birth_year: 2016 }, young10, NOW)).toBe(true);
  });
  it('lets an organization allow it explicitly', () => {
    expect(peerChatBlocked({ role: 'student', birth_year: 2016 }, { ...young10, allow_young_peer_chat: true }, NOW)).toBe(false);
  });
  it('does not block older learners', () => {
    expect(peerChatBlocked({ role: 'student', birth_year: 2005 }, young10, NOW)).toBe(false);
  });
});

// ── fetchCallerIsYoung (database lookup, fetch only) ──────────────────────────
import { fetchCallerIsYoung, clearYoungCache } from './youngLearner.js';
import { claudeText } from './claudeText.js';
import { beforeEach, vi } from 'vitest';

function fakeRest(tables) {
  return vi.fn(async (url) => {
    const u = new URL(url);
    const table = u.pathname.split('/').pop();
    const rows = tables[table];
    if (rows instanceof Error) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => rows ?? [] };
  });
}
const opts = (fetchImpl) => ({ supabaseUrl: 'https://x.supabase.co', key: 'k', fetchImpl, now: NOW });

describe('fetchCallerIsYoung', () => {
  beforeEach(() => clearYoungCache());

  it('is true for a student born within 13 years, without looking up an org', async () => {
    const f = fakeRest({ profiles: [{ role: 'student', birth_year: 2016 }] });
    expect(await fetchCallerIsYoung('u1', opts(f))).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('is false for an older student and for staff', async () => {
    expect(await fetchCallerIsYoung('u2', opts(fakeRest({ profiles: [{ role: 'student', birth_year: 2005 }] })))).toBe(false);
    clearYoungCache();
    expect(await fetchCallerIsYoung('u3', opts(fakeRest({ profiles: [{ role: 'leader', birth_year: null }] })))).toBe(false);
  });
  it('defaults by the organization minimum age when the birth year is blank', async () => {
    const f = fakeRest({ profiles: [{ role: 'student', birth_year: null, organization_id: 'o1' }], organizations: [{ learner_age_min: 10 }] });
    expect(await fetchCallerIsYoung('u4', opts(f))).toBe(true);
  });
  it('falls back to the join code when organization_id is empty', async () => {
    const f = fakeRest({ profiles: [{ role: 'student', birth_year: null, organization_id: null, join_code_used: 'CODE1' }], organizations: [{ learner_age_min: 10 }] });
    expect(await fetchCallerIsYoung('u5', opts(f))).toBe(true);
  });
  it('fails closed (young) when the lookup errors, and does not cache the failure', async () => {
    const bad = fakeRest({ profiles: new Error('down') });
    expect(await fetchCallerIsYoung('u6', opts(bad))).toBe(true);
    const good = fakeRest({ profiles: [{ role: 'student', birth_year: 2000 }] });
    expect(await fetchCallerIsYoung('u6', opts(good))).toBe(false);
  });
  it('caches a successful answer', async () => {
    const f = fakeRest({ profiles: [{ role: 'student', birth_year: 2000 }] });
    await fetchCallerIsYoung('u7', opts(f));
    await fetchCallerIsYoung('u7', opts(f));
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('claudeText', () => {
  it('calls Haiku 5.5 without temperature and returns the text', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    let body;
    const f = vi.fn(async (_u, init) => { body = JSON.parse(init.body); return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'hi' }] }) }; });
    expect(await claudeText({ system: 's', user: 'u', maxTokens: 50, fetchImpl: f })).toBe('hi');
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body).not.toHaveProperty('temperature');
    delete process.env.ANTHROPIC_API_KEY;
  });
});
