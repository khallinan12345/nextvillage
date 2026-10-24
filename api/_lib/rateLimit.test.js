import { describe, it, expect, vi } from 'vitest';
import { allowRequest, callerAddress, fingerprint } from './rateLimit.js';

describe('callerAddress', () => {
  it('uses the first forwarded address, then x-real-ip', () => {
    expect(callerAddress({ headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } })).toBe('1.2.3.4');
    expect(callerAddress({ headers: { 'x-real-ip': '5.6.7.8' } })).toBe('5.6.7.8');
    expect(callerAddress({ headers: {} })).toBe('unknown');
  });
});

describe('fingerprint', () => {
  it('is stable, keyed, and does not contain the address', () => {
    expect(fingerprint('1.2.3.4', 'k')).toBe(fingerprint('1.2.3.4', 'k'));
    expect(fingerprint('1.2.3.4', 'k')).not.toBe(fingerprint('1.2.3.4', 'other'));
    expect(fingerprint('1.2.3.4', 'k')).not.toContain('1.2.3.4');
  });
});

describe('allowRequest', () => {
  const sb = (result) => ({ rpc: vi.fn(async () => result) });

  it('allows while the database says true and blocks on false', async () => {
    expect(await allowRequest(sb({ data: true, error: null }), 'k', 3, 60)).toBe(true);
    expect(await allowRequest(sb({ data: false, error: null }), 'k', 3, 60)).toBe(false);
  });

  it('passes the key, maximum and window to the database', async () => {
    const client = sb({ data: true, error: null });
    await allowRequest(client, 'fsp:check:abc', 120, 3600);
    expect(client.rpc).toHaveBeenCalledWith('rate_limit_hit', { p_key: 'fsp:check:abc', p_max: 120, p_window_seconds: 3600 });
  });

  it('lets the request through if the limiter errors or throws', async () => {
    expect(await allowRequest(sb({ data: null, error: { message: 'down' } }), 'k', 3, 60)).toBe(true);
    expect(await allowRequest({ rpc: async () => { throw new Error('boom'); } }, 'k', 3, 60)).toBe(true);
  });
});
