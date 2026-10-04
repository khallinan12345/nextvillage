// src/lib/apiAuthFetch.ts
//
// Attaches the signed-in user's access token to every fetch() aimed at our
// own /api/* routes, so each route can verify who is calling
// (api/_lib/requireUser.js) without every one of the ~40 call sites having
// to remember to add the header. Installed once, first thing, in main.tsx.
//
// Only same-origin /api/ requests are touched, and only when the caller
// hasn't already set an Authorization header (e.g. src/lib/authHeaders.ts
// callers). Requests to Supabase, Anthropic, etc. pass through unchanged.

import { supabase } from './supabaseClient';

function isOwnApi(input: RequestInfo | URL): boolean {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  try {
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

export function installApiAuthFetch(): void {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isOwnApi(input)) return originalFetch(input, init);

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has('Authorization')) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) headers.set('Authorization', `Bearer ${session.access_token}`);
    }
    return originalFetch(input, { ...init, headers });
  };
}
