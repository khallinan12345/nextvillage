// api/notify-join-request.js
// Vercel Serverless Function
// Usage: POST /api/notify-join-request   (Authorization: Bearer <access token>)
//
// Fired fire-and-forget from ProfileCompletionPopup.tsx after someone enters
// a join code for an existing organization. The database has already put
// their profile in membership_status = 'pending' (see
// 20261004163910_member_approval_and_role_guard.sql); this emails that
// org's leaders so the request doesn't sit unseen. Approving happens on the
// leader's dashboard, never from the email itself — a forwarded email
// shouldn't be able to let someone in.
//
// Takes no body: everything comes from the caller's own verified profile,
// and only a request made in the last few minutes triggers an email, so this
// can't be used to spam leaders.

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

const LEADER_ROLES = ['site_leader', 'leader'];
const FRESH_REQUEST_MS = 10 * 60 * 1000;
// Fixed, not taken from the request — a caller-supplied Origin header would
// let someone put their own link in an email leaders trust.
const DASHBOARD_URL = 'https://www.nextvillage.community/dashboard';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function roleLabel(role) {
  return role === 'site_leader' ? 'co-leader' : 'learner';
}

function buildEmailHtml({ requester, org, dashboardUrl }) {
  return `
  <div style="font-family:-apple-system,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;">
    <h2 style="color:#1F5C4A;margin:0 0 4px;">Someone asked to join ${escapeHtml(org.name)}</h2>
    <p style="color:#516058;font-size:14px;margin:0 0 20px;">
      They can't see your rooms, members or leaderboard until a leader approves them.
    </p>
    <table style="border-collapse:collapse;">
      <tr><td style="padding:6px 12px 6px 0;font-size:13px;color:#516058;">Name</td>
          <td style="padding:6px 0;font-size:13px;color:#1B2420;font-weight:600;">${escapeHtml(requester.name || 'No name given')}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;font-size:13px;color:#516058;">Email</td>
          <td style="padding:6px 0;font-size:13px;color:#1B2420;">${escapeHtml(requester.email || 'No email on file')}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;font-size:13px;color:#516058;">Joining as</td>
          <td style="padding:6px 0;font-size:13px;color:#1B2420;">${roleLabel(requester.role)}</td></tr>
    </table>
    <p style="font-size:14px;color:#1B2420;margin:20px 0 8px;">
      <strong>Only approve people you know.</strong> If you don't recognize this name, decline —
      a real learner can always ask you in person.
    </p>
    <p style="margin:20px 0;">
      <a href="${dashboardUrl}" style="background:#1F5C4A;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px;">
        Review on your dashboard
      </a>
    </p>
    <p style="color:#8B978F;font-size:12px;margin-top:24px;">Sent automatically because this person entered your organization's join code.</p>
  </div>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' });

  try {
    const { data: requester } = await supabase
      .from('profiles')
      .select('name, email, role, organization_id, membership_status, membership_requested_at')
      .eq('id', user.id)
      .single();

    const requestedAt = requester?.membership_requested_at
      ? new Date(requester.membership_requested_at).getTime()
      : 0;
    if (
      !requester?.organization_id ||
      requester.membership_status !== 'pending' ||
      Date.now() - requestedAt > FRESH_REQUEST_MS
    ) {
      // Nothing to announce — not an error from the caller's point of view.
      return res.status(200).json({ success: true, sent: false });
    }

    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .select('id, name, leader_id')
      .eq('id', requester.organization_id)
      .single();
    if (orgErr || !org) throw orgErr || new Error('Organization not found');

    const { data: leaders } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('organization_id', org.id)
      .eq('membership_status', 'approved')
      .in('role', LEADER_ROLES);

    const emails = new Set((leaders ?? []).map(l => l.email).filter(Boolean));
    if (org.leader_id) {
      const { data: primary } = await supabase
        .from('profiles').select('email').eq('id', org.leader_id).maybeSingle();
      if (primary?.email) emails.add(primary.email);
    }

    if (emails.size === 0) {
      console.warn('[notify-join-request] No leader email on file for org', org.id);
      return res.status(200).json({ success: true, sent: false });
    }

    await resend.emails.send({
      from: 'nextVillage <signups@nextvillage.community>',
      to: [...emails],
      subject: `Join request for ${org.name}: ${requester.name || 'new member'}`,
      html: buildEmailHtml({ requester, org, dashboardUrl: DASHBOARD_URL }),
    });

    return res.status(200).json({ success: true, sent: true });
  } catch (err) {
    console.error('[notify-join-request] Error:', err);
    return res.status(500).json({ error: err.message || 'Notification failed' });
  }
}
