// api/notify-org-signup.js
// Vercel Serverless Function
// Usage: POST /api/notify-org-signup
// Body: { organization_id }
//
// Fired fire-and-forget from ProfileCompletionPopup.tsx right after a new
// organization is created (whether or not the leader filled in every
// optional community-context field). Emails the platform's two admins so a
// new signup — full or partial — never goes unseen.

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

const ADMIN_EMAILS = [
  'kevin.hallinan@nextVillage.community',
  'divinegift.morris@nextVillage.community',
];

const TOOL_LABELS = {
  foundations: 'Foundations (English/Math/Science)',
  ai_proficiency: 'AI Proficiency',
  tech_skills: 'Tech Skills',
  creative_ai: 'Creative AI',
  community_impact_ai: 'Community Impact AI',
};

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fieldRow(label, value) {
  const filled = value != null && String(value).trim() !== '';
  return `
    <tr>
      <td style="padding:6px 12px 6px 0;font-size:13px;color:#516058;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:6px 0;font-size:13px;color:${filled ? '#1B2420' : '#8B978F'};font-style:${filled ? 'normal' : 'italic'};">
        ${filled ? escapeHtml(value) : 'Not filled in'}
      </td>
    </tr>`;
}

function buildEmailHtml(org, leader, completionNote) {
  const toolsLabel = Array.isArray(org.enabled_tools) && org.enabled_tools.length > 0
    ? org.enabled_tools.map(t => TOOL_LABELS[t] || t).join(', ')
    : 'All tools enabled by default';

  return `
  <div style="font-family:-apple-system,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;">
    <h2 style="color:#1F5C4A;margin:0 0 4px;">New organization: ${escapeHtml(org.name)}</h2>
    <p style="color:#516058;font-size:14px;margin:0 0 20px;">${completionNote}</p>
    <table style="width:100%;border-collapse:collapse;">
      ${fieldRow('Leader', leader ? `${leader.name || 'Unnamed'} (${leader.email || 'no email on file'})` : null)}
      ${fieldRow('Location', [org.city, org.state, org.country, org.continent].filter(Boolean).join(', ') || null)}
      ${fieldRow('Join code', org.join_code)}
      ${fieldRow('Learner age range', (org.learner_age_min || org.learner_age_max) ? `${org.learner_age_min ?? '?'}–${org.learner_age_max ?? '?'}` : null)}
      ${fieldRow('Description', org.description)}
      ${fieldRow('Educational goals', org.educational_goals)}
      ${fieldRow('Community livelihood', org.community_livelihood)}
      ${fieldRow('Community assets', org.community_assets)}
      ${fieldRow('Community challenges', org.community_challenges)}
      ${fieldRow('Community hopes', org.community_hopes)}
      ${fieldRow('Could offer other communities', org.org_offerings)}
      ${fieldRow('Wishes nextVillage had more of', org.org_wishlist)}
      ${fieldRow('Data retention preference', org.data_retention_preference)}
      ${fieldRow('Tools enabled', toolsLabel)}
    </table>
    <p style="color:#8B978F;font-size:12px;margin-top:24px;">Sent automatically when this organization was created. A leader can fill in or update any blank field later from their Profile page.</p>
  </div>`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { organization_id } = req.body ?? {};
  if (!organization_id) {
    return res.status(400).json({ error: 'Missing organization_id.' });
  }

  try {
    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', organization_id)
      .single();
    if (orgErr) throw orgErr;

    const { data: leader } = await supabase
      .from('profiles')
      .select('name, email')
      .eq('id', org.leader_id)
      .maybeSingle();

    const optionalFields = [
      org.description, org.educational_goals, org.community_livelihood,
      org.community_assets, org.community_challenges, org.community_hopes,
      org.org_offerings, org.org_wishlist, org.data_retention_preference,
    ];
    const filledCount = optionalFields.filter(v => v != null && String(v).trim() !== '').length;
    const completionNote = filledCount === 0
      ? 'Signed up with only the required fields — no optional community-context questions answered yet.'
      : filledCount >= optionalFields.length
      ? 'Every optional community-context question was answered at signup.'
      : `${filledCount} of ${optionalFields.length} optional community-context questions answered at signup.`;

    await resend.emails.send({
      from: 'nextVillage Signups <signups@nextvillage.community>',
      to: ADMIN_EMAILS,
      subject: `New organization: ${org.name}`,
      html: buildEmailHtml(org, leader, completionNote),
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[notify-org-signup] Error:', err);
    return res.status(500).json({ error: err.message || 'Notification failed' });
  }
}
