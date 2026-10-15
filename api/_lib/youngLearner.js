// api/_lib/youngLearner.js
//
// Under-13 tier on the server. Mirrors public.is_young_learner() and
// public.viewer_peer_chat_blocked() in the database (migrations 20261014200000 and
// 20261014210000) — keep the three in step.
//
// "Young" = a student whose birth year says they could be under 13 (year only, so we err
// toward the younger reading), OR a student with no birth year yet who belongs to an
// organization whose minimum learner age is under 13. Leaders, teachers and administrators
// are never young.

export function isYoungLearner(profile, org, now = new Date()) {
  if (!profile || profile.role !== 'student') return false;
  if (profile.birth_year != null) return profile.birth_year >= now.getFullYear() - 13;
  return org?.learner_age_min != null && org.learner_age_min < 13;
}

// Young learners have no peer chat unless their organization has explicitly allowed it
// (organizations.allow_young_peer_chat, off by default).
export function peerChatBlocked(profile, org, now = new Date()) {
  return isYoungLearner(profile, org, now) && !org?.allow_young_peer_chat;
}

// ── Looking the caller up (fetch only, so it also works in the Edge runtime) ──────────────
//
// Used by the AI routes to decide whether a request may go to a vendor we have not vetted
// (OpenAI, the free-tier chain, Groq speech, SpeechGen). Young learners get Anthropic only.
// Fails CLOSED: if the lookup errors we treat the caller as young, which only means they get
// the more careful route for that request.

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

export function clearYoungCache() { cache.clear(); }

export async function fetchCallerIsYoung(userId, opts = {}) {
  if (!userId) return true;
  const {
    supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    key         = process.env.SUPABASE_SERVICE_ROLE_KEY,
    fetchImpl   = fetch,
    now         = new Date(),
  } = opts;

  const hit = cache.get(userId);
  if (hit && hit.until > Date.now()) return hit.young;

  let young;
  try {
    const rest = async (path) => {
      const r = await fetchImpl(`${supabaseUrl}/rest/v1/${path}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      if (!r.ok) throw new Error(`lookup ${r.status}`);
      return r.json();
    };
    const [profile] = await rest(`profiles?id=eq.${encodeURIComponent(userId)}&select=role,birth_year,organization_id,join_code_used`);
    if (!profile) {
      young = false;
    } else if (profile.role !== 'student' || profile.birth_year != null) {
      young = isYoungLearner(profile, null, now);
    } else {
      let org = null;
      const orgSelect = 'learner_age_min,allow_young_peer_chat';
      if (profile.organization_id) {
        [org] = await rest(`organizations?id=eq.${encodeURIComponent(profile.organization_id)}&select=${orgSelect}`);
      } else if (profile.join_code_used?.trim()) {
        const code = profile.join_code_used.trim();
        [org] = await rest(`organizations?join_code=eq.${encodeURIComponent(code)}&select=${orgSelect}`);
        if (!org) [org] = await rest(`organizations?join_codes=cs.${encodeURIComponent(`{"${code}"}`)}&select=${orgSelect}`);
      }
      young = isYoungLearner(profile, org ?? null, now);
    }
  } catch {
    return true; // fail closed, and do not cache the failure
  }
  cache.set(userId, { young, until: Date.now() + CACHE_MS });
  return young;
}
