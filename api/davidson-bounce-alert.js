// api/davidson-bounce-alert.js
// Receives Resend's `email.bounced` webhook. When a magic-link/login email
// bounces for a student in the Davidson AI Futures Lab (Oloibiri org), emails
// Confidence Davidson so she can help that student get a working address.
//
// Resend dashboard config:
//   Webhooks → Add Endpoint
//   URL:    https://www.nextvillage.community/api/davidson-bounce-alert
//   Events: email.bounced
//   Copy the generated Signing Secret into RESEND_BOUNCE_WEBHOOK_SECRET below.
//
// Required Vercel env vars:
//   RESEND_BOUNCE_WEBHOOK_SECRET — Resend's webhook signing secret (whsec_...)
//   DAVIDSON_LAB_CONTACT_EMAIL   — confidenceonuoha416@gmail.com
//   RESEND_API_KEY, RESEND_ALERTS_FROM_EMAIL — already configured
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — already configured

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const OLOIBIRI_ORG_ID = 'a1b2c3d4-0001-0001-0001-000000000001';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h — one alert per student per day
const TIMESTAMP_TOLERANCE_S = 5 * 60; // 5 min replay-protection window

// ─── Verify the webhook really came from Resend (Svix signing scheme) ───────

function verifySignature(req, rawBody) {
  const secret = process.env.RESEND_BOUNCE_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[davidson-bounce-alert] RESEND_BOUNCE_WEBHOOK_SECRET not set — rejecting');
    return false;
  }

  const svixId = req.headers['svix-id'];
  const svixTimestamp = req.headers['svix-timestamp'];
  const svixSignature = req.headers['svix-signature'];
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const age = Math.abs(Date.now() / 1000 - Number(svixTimestamp));
  if (!Number.isFinite(age) || age > TIMESTAMP_TOLERANCE_S) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest();

  return svixSignature.split(' ').some((part) => {
    const [, sig] = part.split(',');
    if (!sig) return false;
    try {
      const given = Buffer.from(sig, 'base64');
      return given.length === expected.length && crypto.timingSafeEqual(given, expected);
    } catch {
      return false;
    }
  });
}

// ─── Dedup via the existing triage_dedup table, distinctly-prefixed key ─────

async function alreadyAlertedRecently(email) {
  const key = `davidson-bounce:${email}`;

  await supabase
    .from('triage_dedup')
    .delete()
    .eq('dedup_key', key)
    .lt('created_at', new Date(Date.now() - DEDUP_WINDOW_MS).toISOString());

  const { error } = await supabase.from('triage_dedup').insert({ dedup_key: key });
  if (error?.code === '23505') return true; // unique_violation → already alerted
  if (error) console.error('[davidson-bounce-alert] Dedup insert error:', error.message);
  return false;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = JSON.stringify(req.body);

  if (!verifySignature(req, rawBody)) {
    console.warn('[davidson-bounce-alert] Invalid signature — request rejected');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { type, data } = req.body || {};

  if (type !== 'email.bounced' || !data) {
    return res.status(200).json({ message: 'Ignored — not a bounce event' });
  }

  const subject = data.subject || '';
  if (!/magic link/i.test(subject)) {
    return res.status(200).json({ message: 'Ignored — not a magic-link email' });
  }

  const recipientEmail = Array.isArray(data.to) ? data.to[0] : data.to;
  if (!recipientEmail) {
    return res.status(200).json({ message: 'Ignored — no recipient on bounce event' });
  }

  try {
    const { data: student, error: studentErr } = await supabase
      .from('profiles')
      .select('name, email, organization_id')
      .eq('email', recipientEmail)
      .maybeSingle();

    if (studentErr || !student || student.organization_id !== OLOIBIRI_ORG_ID) {
      return res.status(200).json({ message: 'Ignored — not a Davidson AI Futures Lab student' });
    }

    const contactEmail = process.env.DAVIDSON_LAB_CONTACT_EMAIL;
    if (!contactEmail) {
      console.error('[davidson-bounce-alert] Missing DAVIDSON_LAB_CONTACT_EMAIL');
      return res.status(500).json({ error: 'Alert recipient is not configured' });
    }

    if (await alreadyAlertedRecently(student.email)) {
      return res.status(200).json({ message: 'Deduplicated — already alerted within 24h' });
    }

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 4px 0;font-size:20px;color:#111;">📪 Student email undeliverable</h2>
        <p style="margin:0 0 20px 0;color:#6b7280;font-size:13px;">Davidson AI Futures Lab · Oloibiri</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:600;width:140px;">Student</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">${student.name || 'Unknown'}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:600;">Email on file</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;font-family:monospace;">${student.email}</td>
          </tr>
        </table>
        <p style="margin:20px 0 0 0;font-size:14px;color:#374151;line-height:1.7;">
          This student's login (magic link) email just bounced — the address above isn't
          receiving mail. They'll need a working email address on file to be able to log
          back in. Please help them get a working email address updated.
        </p>
      </div>
    `;

    const { data: sendResult, error: sendError } = await resend.emails.send({
      from: process.env.RESEND_ALERTS_FROM_EMAIL,
      to: [contactEmail],
      subject: `Student email undeliverable: ${student.name || student.email}`,
      html,
    });

    if (sendError) {
      console.error('[davidson-bounce-alert] Resend error:', sendError);
      return res.status(502).json({ error: sendError.message || 'Resend rejected the email' });
    }

    console.log(`[davidson-bounce-alert] Alerted ${contactEmail} about ${student.email} (${sendResult?.id})`);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[davidson-bounce-alert] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to process bounce' });
  }
}
