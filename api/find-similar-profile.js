// api/find-similar-profile.js
// Vercel Serverless Function
// Usage: POST /api/find-similar-profile
//   { action: 'check',      email?, name?, join_code? }            → { match: { id, maskedEmail } | null }
//   { action: 'send-reset', email?, name?, join_code?, match_id }   → { sent: true }
//
// Duplicate-account detection for sign-up (AuthForm.tsx, signed out) and
// profile completion (ProfileCompletionPopup.tsx, signed in). This used to
// run in the browser against find_similar_profile_candidates(), which handed
// every active user's name and email to anyone who called it. Now the
// candidate list stays here and the browser gets back at most one match
// with its email masked.
//
// Signed out: email similarity only, across the platform.
// Signed in + join_code: also name similarity, but only within the
//   organization that join code belongs to (a code is needed, not just an
//   org id, so this can't be used to probe arbitrary organizations).
//
// "send-reset" re-runs the same match server-side and only then emails a
// sign-in link to the matched account's real address — the same thing
// "Forgot password" does for any email, so it gives a caller nothing new.

import { createClient } from '@supabase/supabase-js';
import { findBestMatch, maskEmail } from './_lib/duplicateMatch.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Fixed, not taken from the request, so a caller can't point the link
// somewhere else. Supabase also only honours redirect URLs on its allow list.
const SITE_URL = process.env.SITE_URL || 'https://www.nextvillage.community';

async function callerId(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  return user?.id ?? null;
}

async function match({ email, name, join_code }, userId) {
  let organizationId = null;
  if (userId && join_code) {
    const { data } = await supabase.rpc('org_id_for_join_code', { code: join_code });
    organizationId = data ?? null;
  }

  const { data: candidates, error } = await supabase.rpc('find_similar_profile_candidates', {
    p_organization_id: organizationId,
    p_exclude_user_id: userId,
  });
  if (error) throw error;

  return findBestMatch(candidates, {
    email: typeof email === 'string' ? email : '',
    name: typeof name === 'string' ? name : '',
    matchNames: !!organizationId,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const body = req.body ?? {};
  try {
    const userId = await callerId(req);
    const found = await match(body, userId);

    if (body.action === 'check') {
      return res.status(200).json({
        match: found ? { id: found.id, maskedEmail: maskEmail(found.email) } : null,
      });
    }

    if (body.action === 'send-reset') {
      if (!found || found.id !== body.match_id) {
        return res.status(404).json({ error: 'No matching account found.' });
      }
      const { error } = await supabase.auth.signInWithOtp({
        email: found.email,
        options: { shouldCreateUser: false, emailRedirectTo: `${SITE_URL}/auth/reset-password` },
      });
      if (error) throw error;
      return res.status(200).json({ sent: true });
    }

    return res.status(400).json({ error: "action must be 'check' or 'send-reset'" });
  } catch (err) {
    console.error('[find-similar-profile] Error:', err);
    return res.status(500).json({ error: err.message || 'Lookup failed' });
  }
}
