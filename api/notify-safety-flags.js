// api/notify-safety-flags.js
// Vercel Serverless Function
// Usage: POST /api/notify-safety-flags   (no body, no login)
//
// Emails an organization's leaders about new "Use Claude Together" safety
// flags — messages the database flagged automatically (phone numbers,
// "WhatsApp me", job/travel offers abroad, money requests, secrecy) and
// messages a member reported. Called by the database itself: a trigger on
// together_safety_flags pings this endpoint via pg_net, and a pg_cron job
// retries every 10 minutes while anything is still unsent. See
// 20261005021247_together_room_safety_flags.sql.
//
// Deliberately needs no login or secret: it takes no input and only ever
// sends flags that haven't been emailed yet, each exactly once (emailed_at
// is claimed atomically below). Calling it more often can't send more email,
// change who receives it, or reveal anything to the caller.

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

const LEADER_ROLES = ['site_leader', 'leader'];
// Flags older than this are left for the dashboard rather than emailed late.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Fixed, not taken from the request — see notify-join-request.js.
const DASHBOARD_URL = 'https://www.nextvillage.community/dashboard';
// Comma-separated address(es) copied on every flag — same variable as the
// AI-chat safety alerts in api/_lib/safetyGuardrails.js.
const FALLBACK_EMAILS = (process.env.SAFETY_ALERT_FALLBACK_EMAIL || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const CATEGORY_LABELS = {
  contact_off_platform: 'Sharing contact details / moving chat off the platform',
  job_or_travel_offer:  'Job, travel or visa offer abroad',
  money_request:        'Money, airtime or bank details',
  secrecy_or_meeting:   'Secrecy, meeting up, or asking for photos',
};

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function flagHtml(flag, reporterName) {
  const why = flag.source === 'report'
    ? `Reported by ${escapeHtml(reporterName || 'a member')}${flag.report_reason ? `: “${escapeHtml(flag.report_reason)}”` : ''}`
    : `Flagged automatically: ${flag.categories.map(c => escapeHtml(CATEGORY_LABELS[c] || c)).join('; ')}`;
  return `
    <div style="border:1px solid #E4D9C8;border-radius:8px;padding:12px 14px;margin:0 0 12px;">
      <p style="margin:0 0 4px;font-size:13px;color:#9A3412;font-weight:600;">${why}</p>
      <p style="margin:0 0 8px;font-size:13px;color:#516058;">
        From <strong style="color:#1B2420;">${escapeHtml(flag.sender_name || 'unknown')}</strong>
        in room “${escapeHtml(flag.room_name || 'deleted room')}” · ${new Date(flag.created_at).toUTCString()}
      </p>
      <blockquote style="margin:0;border-left:3px solid #ccc;padding-left:12px;color:#333;font-size:14px;white-space:pre-wrap;">${escapeHtml((flag.excerpt || '').slice(0, 1000))}</blockquote>
    </div>`;
}

function buildEmailHtml({ org, flags, reporterNames }) {
  return `
  <div style="font-family:-apple-system,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;">
    <h2 style="color:#9A3412;margin:0 0 4px;">Safety check needed in ${escapeHtml(org.name)}</h2>
    <p style="color:#516058;font-size:14px;margin:0 0 20px;">
      ${flags.length === 1 ? 'A message' : `${flags.length} messages`} in “Use Claude Together” may need a leader’s attention.
      Automatic flags can be wrong — please read the message and talk to the young people involved before assuming anything.
    </p>
    ${flags.map(f => flagHtml(f, reporterNames.get(f.reported_by))).join('')}
    <p style="font-size:14px;color:#1B2420;margin:20px 0 8px;">
      <strong>If someone is asking a young person for their number, money, photos, a meeting, or offering travel or work abroad,</strong>
      remove the message, speak to the young person in person, and contact their parent or guardian.
    </p>
    <p style="margin:20px 0;">
      <a href="${DASHBOARD_URL}" style="background:#1F5C4A;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px;">
        Review on your dashboard
      </a>
    </p>
    <p style="color:#8B978F;font-size:12px;margin-top:24px;">Sent automatically by nextVillage’s room safety checks.</p>
  </div>`;
}

async function leaderEmails(org) {
  const { data: leaders } = await supabase
    .from('profiles')
    .select('email')
    .eq('organization_id', org.id)
    .eq('membership_status', 'approved')
    .in('role', LEADER_ROLES);

  const emails = new Set([...FALLBACK_EMAILS, ...(leaders ?? []).map(l => l.email).filter(Boolean)]);
  if (org.leader_id) {
    const { data: primary } = await supabase
      .from('profiles').select('email').eq('id', org.leader_id).maybeSingle();
    if (primary?.email) emails.add(primary.email);
  }
  return [...emails];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // Claim every unsent flag in one UPDATE … WHERE emailed_at IS NULL, so two
  // overlapping calls can never email the same flag twice.
  const claimedAt = new Date().toISOString();
  const { data: flags, error: claimErr } = await supabase
    .from('together_safety_flags')
    .update({ emailed_at: claimedAt })
    .is('emailed_at', null)
    .gte('created_at', new Date(Date.now() - MAX_AGE_MS).toISOString())
    .select('id, organization_id, room_name, sender_name, excerpt, source, categories, reported_by, report_reason, created_at');

  if (claimErr) {
    console.error('[notify-safety-flags] claim failed:', claimErr);
    return res.status(500).json({ error: 'claim_failed' });
  }
  if (!flags?.length) return res.status(200).json({ success: true, sent: 0 });

  const reporterIds = [...new Set(flags.map(f => f.reported_by).filter(Boolean))];
  const reporterNames = new Map();
  if (reporterIds.length) {
    const { data: reporters } = await supabase.from('profiles').select('id, name').in('id', reporterIds);
    (reporters ?? []).forEach(r => reporterNames.set(r.id, r.name));
  }

  const byOrg = new Map();
  for (const f of flags) {
    if (!byOrg.has(f.organization_id)) byOrg.set(f.organization_id, []);
    byOrg.get(f.organization_id).push(f);
  }

  let sent = 0;
  const unsent = [];
  for (const [orgId, orgFlags] of byOrg) {
    try {
      const { data: org, error: orgErr } = await supabase
        .from('organizations').select('id, name, leader_id').eq('id', orgId).single();
      if (orgErr || !org) throw orgErr || new Error('Organization not found');

      const to = await leaderEmails(org);
      if (!to.length) {
        // Still visible on the dashboard; nothing to retry by email.
        console.warn('[notify-safety-flags] No leader email on file for org', orgId);
        continue;
      }

      const { error: sendErr } = await resend.emails.send({
        from: 'nextVillage Safety <safety@nextvillage.community>',
        to,
        subject: `[Safety] ${orgFlags.length === 1 ? 'A message needs' : `${orgFlags.length} messages need`} review in ${org.name}`,
        html: buildEmailHtml({ org, flags: orgFlags, reporterNames }),
      });
      if (sendErr) throw sendErr;
      sent += orgFlags.length;
    } catch (err) {
      console.error('[notify-safety-flags] send failed for org', orgId, err);
      unsent.push(...orgFlags.map(f => f.id));
    }
  }

  // Release anything that failed so the 10-minute retry picks it up.
  if (unsent.length) {
    await supabase
      .from('together_safety_flags')
      .update({ emailed_at: null })
      .in('id', unsent)
      .eq('emailed_at', claimedAt);
  }

  return res.status(200).json({ success: true, sent, failed: unsent.length });
}
