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
