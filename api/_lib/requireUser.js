// api/_lib/requireUser.js
//
// Resolves the signed-in user behind a request from its
// "Authorization: Bearer <access token>" header. The browser adds that
// header to every /api/ call automatically (src/lib/apiAuthFetch.ts).
// Never trust a user id sent in the request body — anyone can type any id.

import { createClient } from '@supabase/supabase-js';

let defaultClient;
function client() {
  defaultClient ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return defaultClient;
}

export async function getUserFromAuthHeader(authHeader, supabase = client()) {
  const token = (authHeader || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return error ? null : user;
}

// Node-style routes (req.headers is a plain object).
export async function getRequestUser(req, supabase = client()) {
  return getUserFromAuthHeader(req.headers.authorization, supabase);
}

// For routes that only need "is this a signed-in user?": sends a 401 and
// returns null when not, so a handler can do
//   const user = await requireUser(req, res); if (!user) return;
export async function requireUser(req, res) {
  const user = await getRequestUser(req);
  if (!user) {
    res.status(401).json({ error: 'Please sign in to use this feature.' });
    return null;
  }
  return user;
}
