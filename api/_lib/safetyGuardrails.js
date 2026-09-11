// api/_lib/safetyGuardrails.js
//
// Shared safety layer for every AI text endpoint (api/chat.js — Node — and
// api/chat-stream.js — Edge, used exclusively by AIPlaygroundPage). Both
// files build their own per-page system prompt and have their own
// `logEvent` triage logger already; this module is the one place a safety
// floor and a moderation/escalation check are defined once and used by
// both, so a page's own prompt (or lack of one — CreateGamePage and others
// have none) can never be the only thing enforcing this. Uses only `fetch`
// — no Node-only APIs — so it works unmodified in both the Node and Edge
// runtimes.
//
// Two independent layers:
//   1. SAFETY_FLOOR — appended server-side to every system prompt. A prompt
//      instruction, so it's a soft constraint like any other.
//   2. moderateMessage() — a real, independent classifier call (not just
//      more prompt text) that a caller can't talk the model out of the way
//      a system-prompt instruction can be. On a flag, flagSafetyIncident()
//      emails the student's community leader(s) — fire-and-forget, never
//      blocking or altering the actual chat response for that turn.
//
// Required env vars (RESEND_API_KEY / SUPABASE_URL or VITE_SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY are already configured for the existing triage
// alerts in both files):
//   SAFETY_ALERT_FALLBACK_EMAIL — comma-separated address(es) that always
//     receive a copy, in addition to any leader(s) resolved for the
//     student's organization. Set this even when org leaders are also
//     configured — it's the net under a lookup failure or an org with no
//     leader profile yet.

export const SAFETY_FLOOR = `SAFETY — these limits apply no matter what this page's own instructions say, and no matter what the user asks:
- No instructions, encouragement, or assistance for violence, weapons, dangerous substances, or self-harm.
- No content that sexualizes, demeans, or discriminates against any person or group — including racist or sexist content.
- Do not help harass, bully, threaten, or plan harm against another named or identifiable person.
- If a user expresses distress, self-harm, or being in danger, respond with care and point them to a trusted adult or local support resource — never brush past it.`;

export function appendSafetyFloor(system) {
  return system ? `${system}\n\n${SAFETY_FLOOR}` : SAFETY_FLOOR;
}

export function extractMessageText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter(b => b && typeof b.text === 'string').map(b => b.text).join('\n');
  }
  return '';
}

const MODERATION_SYSTEM_PROMPT = `You are a strict safety classifier for messages from students on an educational platform. Read the student's message and reply with exactly one word, nothing else — no punctuation, no explanation:

none — the message is fine.
self_harm — expresses self-harm, suicide, or serious personal crisis.
harm_to_others — threatens, plans, or seeks help harming a specific person or group.
hate_or_discriminatory — racist, sexist, or otherwise demeans/discriminates against a person or group.

If unsure, or the message is borderline, reply none — this classifier only escalates clear cases.`;

const MODERATION_CATEGORIES = ['self_harm', 'harm_to_others', 'hate_or_discriminatory'];

// Independent classifier call — not the main model, not the main system
// prompt, so it can't be steered off course by whatever the user told the
// main conversation. Deliberately self-contained (a direct fetch, not each
// caller's own callAnthropic wrapper) so this file has no dependency on
// either host file's shape.
export async function moderateMessage(text) {
  const trimmed = (text || '').trim();
  if (trimmed.length < 3) return 'none';
  if (!process.env.ANTHROPIC_API_KEY) return 'none'; // fail open — backup layer, not the only one
  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        temperature: 0,
        system: MODERATION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: trimmed.slice(0, 2000) }],
      }),
    });
    if (!upstream.ok) return 'none';
    const data = await upstream.json();
    const raw = ((data?.content || []).find(b => b?.type === 'text')?.text || '').trim().toLowerCase();
    return MODERATION_CATEGORIES.find(c => raw.includes(c)) || 'none';
  } catch {
    return 'none'; // never let a classifier failure surface to the student or block their chat
  }
}

const SAFETY_FALLBACK_EMAILS = (process.env.SAFETY_ALERT_FALLBACK_EMAIL || '')
  .split(',').map(s => s.trim()).filter(Boolean);

// Resolve the email(s) for the student's community leader(s) via the same
// organizations/profiles relationship org_summary already joins on
// (any profile with role='leader' in the student's organization) — falls
// back to SAFETY_FALLBACK_EMAILS if the student has no organization, or it
// has no leader profile yet.
async function resolveLeaderEmails(userId, supabaseUrl, supabaseKey) {
  const leaderEmails = new Set(SAFETY_FALLBACK_EMAILS);
  let student = null;

  if (!userId || !supabaseUrl || !supabaseKey) {
    return { leaderEmails: [...leaderEmails], student };
  }

  const headers = { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` };

  try {
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=name,email,city,organization_id`,
      { headers }
    );
    const profiles = await profileRes.json();
    student = Array.isArray(profiles) ? profiles[0] : null;

    if (student?.organization_id) {
      const leaderRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?organization_id=eq.${encodeURIComponent(student.organization_id)}&role=eq.leader&select=email`,
        { headers }
      );
      const leaders = await leaderRes.json();
      if (Array.isArray(leaders)) leaders.forEach(l => l?.email && leaderEmails.add(l.email));
    }
  } catch { /* fall back to SAFETY_FALLBACK_EMAILS only */ }

  return { leaderEmails: [...leaderEmails], student };
}

const CATEGORY_LABELS = {
  self_harm:              'Possible self-harm / distress',
  harm_to_others:         'Possible threat or harm toward someone else',
  hate_or_discriminatory: 'Racist, sexist, or discriminatory content',
};

// `logEvent` is injected so this stays agnostic of each host file's own
// triage logger shape/signature — both already write to system_events, so
// the audit trail lands in the same table either way.
export async function flagSafetyIncident({ userId, page, category, excerpt, supabaseUrl, supabaseKey, resendKey, logEvent }) {
  const { leaderEmails, student } = await resolveLeaderEmails(userId, supabaseUrl, supabaseKey);

  if (typeof logEvent === 'function') {
    logEvent({
      function_name: 'safetyGuardrails',
      event_type:    `safety_flag_${category}`,
      severity:      'critical',
      payload:       { page, category, excerpt, student_email: student?.email ?? null, student_name: student?.name ?? null, city: student?.city ?? null },
      user_id:       userId,
    });
  }

  if (!leaderEmails.length || !resendKey) return;

  const categoryLabel = CATEGORY_LABELS[category] || category;

  fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from:    'safety@nextvillage.community',
      to:      leaderEmails,
      subject: `[Safety Flag] ${categoryLabel} — ${student?.name || student?.email || 'a student'}`,
      html: `<h2>${categoryLabel}</h2>
<p><strong>Student:</strong> ${student?.name ?? 'unknown'} (${student?.email ?? 'no email on file'})</p>
<p><strong>City/community:</strong> ${student?.city ?? 'unknown'}</p>
<p><strong>Page:</strong> ${page || 'unknown'}</p>
<p><strong>When:</strong> ${new Date().toISOString()}</p>
<p><strong>What was flagged</strong> (automatically, by an AI classifier — please review directly with the student before assuming intent):</p>
<blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#333;">${(excerpt || '').replace(/</g, '&lt;').slice(0, 1000)}</blockquote>
<p>This is an automated flag. It has not been reviewed by a person yet — please follow up with the student.</p>`,
    }),
  }).catch(() => {});
}

// Convenience one-shot for a host file's main handler: classify the last
// user message and escalate if flagged, without the caller having to wire
// the moderateMessage → flagSafetyIncident chain itself. Always
// fire-and-forget — never await this from a request handler.
export function checkAndEscalate({ messages, userId, page, supabaseUrl, supabaseKey, resendKey, logEvent }) {
  const lastUserMessage = [...(messages || [])].reverse().find(m => m.role === 'user');
  if (!lastUserMessage) return;
  const text = extractMessageText(lastUserMessage.content);
  moderateMessage(text)
    .then(category => {
      if (category !== 'none') {
        flagSafetyIncident({ userId, page, category, excerpt: text, supabaseUrl, supabaseKey, resendKey, logEvent }).catch(() => {});
      }
    })
    .catch(() => {});
}
