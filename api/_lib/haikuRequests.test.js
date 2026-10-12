import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrubMessagesPII } from './piiScrubbing.js';
import { moderateMessage } from './safetyGuardrails.js';

// claude-haiku-5-5 answers any request that includes `temperature` with a 400
// ("`temperature` is deprecated for this model"). That silently switched off
// the name-scrubbing pass and the safety classifier for a day, so these tests
// pin the request shape.

const okResponse = (text) => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text }] }) });

afterEach(() => { vi.restoreAllMocks(); delete process.env.ANTHROPIC_API_KEY; });

describe('Haiku 5.5 request bodies', () => {
  it('PII extraction sends no temperature', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    const bodies = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => { bodies.push(JSON.parse(init.body)); return okResponse('[]'); }));
    await scrubMessagesPII([{ role: 'user', content: 'My friend Achieng lives near me' }], 'Sam');
    expect(bodies).toHaveLength(1);
    expect(bodies[0].model).toBe('claude-haiku-5-5');
    expect(bodies[0]).not.toHaveProperty('temperature');
  });

  it('safety classifier sends no temperature', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    const bodies = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => { bodies.push(JSON.parse(init.body)); return okResponse('none'); }));
    expect(await moderateMessage('I had a good day at school')).toBe('none');
    expect(bodies[0].model).toBe('claude-haiku-5-5');
    expect(bodies[0]).not.toHaveProperty('temperature');
  });

  it('safety classifier logs when the upstream call fails instead of staying silent', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400, json: async () => ({}) })));
    const logEvent = vi.fn();
    expect(await moderateMessage('I had a good day at school', logEvent)).toBe('none');
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'safety_classifier_upstream_error' }));
  });
});
