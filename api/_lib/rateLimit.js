// api/_lib/rateLimit.js
//
// Request limits for public API routes (anyone can call them, no sign-in). The counting happens in the
// database (rate_limit_hit, migration 20261024220000) because serverless instances share no memory.
//
// Callers are identified by an HMAC of their network address, so no raw address is stored. If the limiter
// itself fails we let the request through: a database hiccup must not stop learners from signing up.

import { createHmac } from 'node:crypto';

export function callerAddress(req) {
  const h = req.headers || {};
  const forwarded = String(h['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(h['x-real-ip'] || '').trim() || 'unknown';
}

export function fingerprint(value, secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'unset') {
  return createHmac('sha256', secret).update(String(value)).digest('hex').slice(0, 32);
}

// True when the request may go ahead.
export async function allowRequest(supabase, key, max, windowSeconds) {
  try {
    const { data, error } = await supabase.rpc('rate_limit_hit', {
      p_key: key, p_max: max, p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error('[rateLimit] limiter error, allowing request:', error.message);
      return true;
    }
    return data !== false;
  } catch (err) {
    console.error('[rateLimit] limiter failed, allowing request:', err?.message);
    return true;
  }
}
