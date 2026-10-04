import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: 'tok-123' } } })),
    },
  },
}));

const seen: { url: string; auth: string | null }[] = [];

beforeAll(async () => {
  window.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    seen.push({ url, auth: new Headers(init?.headers).get('Authorization') });
    return Promise.resolve(new Response('{}'));
  }) as typeof fetch;
  const { installApiAuthFetch } = await import('./apiAuthFetch');
  installApiAuthFetch();
});

describe('installApiAuthFetch', () => {
  it('adds the access token to our own /api/ routes', async () => {
    await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(seen.at(-1)).toEqual({ url: '/api/chat', auth: 'Bearer tok-123' });
  });

  it('leaves other sites alone', async () => {
    await fetch('https://api.example.com/api/chat');
    expect(seen.at(-1)?.auth).toBeNull();
  });

  it('keeps an Authorization header the caller already set', async () => {
    await fetch('/api/platform-news', { headers: { Authorization: 'Bearer server-secret' } });
    expect(seen.at(-1)?.auth).toBe('Bearer server-secret');
  });
});
