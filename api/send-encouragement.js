// api/send-encouragement.js
// Lets site leaders / teachers / platform administrators / leaders / research
// leads send a leaderboard participant an email of encouragement or advice,
// directly from the Dashboard's current-challenge leaderboard.
//
// Required Vercel env vars (already configured for other Resend-based routes):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   RESEND_API_KEY
//   RESEND_ALERTS_FROM_EMAIL — a verified sender, e.g. alerts@nextvillage.community

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

const ALLOWED_ROLES = new Set([
  'site_leader',
  'teacher',
  'platform_administrator',
  'leader',
  'research_lead',
]);

const ROLE_LABEL = {
  site_leader: 'Site Leader',
  teacher: 'Teacher',
  platform_administrator: 'Platform Administrator',
  leader: 'Leader',
  research_lead: 'Research Lead',
};

const MAX_SUBJECT_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 5000;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmailHtml({ senderName, senderRole, message }) {
  const roleLabel = ROLE_LABEL[senderRole] || senderRole;
  const messageHtml = escapeHtml(message).replace(/\n/g, '<br/>');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;margin:0;padding:32px 16px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#065f46,#047857);padding:28px 32px;">
      <div style="font-size:11px;font-weight:700;color:#a7f3d0;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px;">vAI Community Challenge</div>
      <h1 style="font-size:20px;font-weight:700;color:#fff;margin:0;">A message for you</h1>
    </div>
    <div style="padding:28px 32px;">
      <p style="font-size:13px;color:#64748b;margin:0 0 20px;">
        From <strong>${escapeHtml(senderName)}</strong> · ${escapeHtml(roleLabel)}
      </p>
      <p style="font-size:15px;color:#1f2937;line-height:1.75;margin:0;">${messageHtml}</p>
    </div>
    <div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <p style="font-size:12px;color:#94a3b8;margin:0;line-height:1.6;">
        Sent from the vAI community challenge leaderboard. Reply to this email to respond directly.
      </p>
    </div>
  </div>
</body>
</html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' });

  const { recipient_id, subject, message } = req.body || {};

  if (!recipient_id || typeof recipient_id !== 'string') {
    return res.status(400).json({ error: 'recipient_id is required' });
  }
  const trimmedSubject = typeof subject === 'string' ? subject.trim() : '';
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  if (!trimmedSubject || trimmedSubject.length > MAX_SUBJECT_LENGTH) {
    return res.status(400).json({ error: `Subject is required and must be under ${MAX_SUBJECT_LENGTH} characters` });
  }
  if (!trimmedMessage || trimmedMessage.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Message is required and must be under ${MAX_MESSAGE_LENGTH} characters` });
  }
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_ALERTS_FROM_EMAIL) {
    console.error('[send-encouragement] Missing RESEND_API_KEY or RESEND_ALERTS_FROM_EMAIL');
    return res.status(500).json({ error: 'Email sending is not configured' });
  }

  try {
    const { data: sender, error: senderErr } = await supabase
      .from('profiles')
      .select('name, email, role, organization_id')
      .eq('id', user.id)
      .single();

    if (senderErr || !sender) return res.status(403).json({ error: 'Sender profile not found' });
    if (!ALLOWED_ROLES.has(sender.role)) {
      return res.status(403).json({ error: 'You do not have permission to send this' });
    }

    const { data: recipient, error: recipientErr } = await supabase
      .from('profiles')
      .select('name, email, organization_id')
      .eq('id', recipient_id)
      .single();

    if (recipientErr || !recipient) return res.status(404).json({ error: 'Recipient not found' });
    if (!recipient.email) return res.status(404).json({ error: 'Recipient has no email on file' });

    if (sender.role !== 'platform_administrator' && recipient.organization_id !== sender.organization_id) {
      return res.status(403).json({ error: 'You can only message members of your own organization' });
    }

    const html = buildEmailHtml({
      senderName: sender.name || 'A vAI community leader',
      senderRole: sender.role,
      message: trimmedMessage,
    });

    const { data: sendResult, error: sendError } = await resend.emails.send({
      from: process.env.RESEND_ALERTS_FROM_EMAIL,
      to: [recipient.email],
      replyTo: sender.email,
      subject: trimmedSubject,
      html,
    });

    if (sendError) {
      console.error('[send-encouragement] Resend error:', sendError);
      return res.status(502).json({ error: sendError.message || 'Resend rejected the email' });
    }

    console.log(`[send-encouragement] Sent ${sendResult?.id} to ${recipient.email}`);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[send-encouragement] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to send' });
  }
}
