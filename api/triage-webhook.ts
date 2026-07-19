// api/triage-webhook.ts
// Receives POST from Supabase Database Webhook on system_events INSERT.
// Filters for actionable errors and sends an email alert via Resend.
//
// Supabase Webhook config:
//   Table:  system_events
//   Events: INSERT
//   URL:    https://www.nextvillage.community/api/triage-webhook
//   Secret: set TRIAGE_WEBHOOK_SECRET in Vercel env vars
//
// Required Vercel env vars:
//   TRIAGE_WEBHOOK_SECRET  — shared secret from Supabase webhook config
//   RESEND_API_KEY         — from resend.com
//   RESEND_ALERTS_FROM_EMAIL — a verified sender, e.g. alerts@nextvillage.community
//   TRIAGE_ALERT_EMAIL     — where alerts are delivered, e.g. khallinan1@udayton.edu

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// ─── Supabase client (service role — bypasses RLS) ───────────────────────────

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

// ─── Error types that warrant an alert ───────────────────────────────────────

const ACTIONABLE_EVENTS = new Set([
  'rate_limit',
  'max_tokens_hit',
  'api_overloaded',
  'stream_read_error',
  'json_parse_failure',
  'sse_parse_errors',
  'unhandled_exception',
  'anthropic_server',
  'invalid_request',
  'auth_error',
  'missing_api_key',
  'http_520',        // ← add this
  'http_error',      // ← catch-all for anything else chat-stream logs
  'model_deprecated',   // ← from api/model-check cron: configured model gone from provider
  'model_check_failed', // ← model-check couldn't fetch a provider's list
]);

const ACTIONABLE_SEVERITIES = new Set(['warning', 'error', 'critical']);

// ─── Severity → colour for the email badge ───────────────────────────────────

const SEVERITY_COLOR: Record<string, string> = {
  warning:  '#f59e0b',
  error:    '#ef4444',
  critical: '#7c3aed',
};

// ─── Persistent dedup via Supabase ───────────────────────────────────────────
// Requires this table (run once in Supabase SQL editor):
//
//   create table if not exists triage_dedup (
//     dedup_key  text primary key,
//     created_at timestamptz default now()
//   );
//
//   -- Auto-expire rows after 10 minutes so the same error can re-alert later
//   create index on triage_dedup (created_at);
//
// A pg_cron job (or just let the webhook clean up on each call):
//   delete from triage_dedup where created_at < now() - interval '10 minutes';

const DEDUP_WINDOW_MINUTES = 10;

async function isDuplicate(key: string): Promise<boolean> {
  const supabase = getSupabase();

  // Prune expired entries first
  await supabase
    .from('triage_dedup')
    .delete()
    .lt('created_at', new Date(Date.now() - DEDUP_WINDOW_MINUTES * 60 * 1000).toISOString());

  // Try to claim the slot — conflict means it already exists (duplicate)
  const { error } = await supabase
    .from('triage_dedup')
    .insert({ dedup_key: key });

  if (error?.code === '23505') return true;  // unique_violation → duplicate
  if (error) console.error('[triage-webhook] Dedup insert error:', error.message);
  return false;
}

// ─── Send alert email via Resend ─────────────────────────────────────────────

async function sendAlertEmail(event: {
  event_type: string;
  function_name: string;
  severity: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const apiKey   = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_ALERTS_FROM_EMAIL;
  const toEmail  = process.env.TRIAGE_ALERT_EMAIL;

  if (!apiKey || !fromEmail || !toEmail) {
    console.error('[triage-webhook] Missing RESEND_API_KEY, RESEND_ALERTS_FROM_EMAIL, or TRIAGE_ALERT_EMAIL');
    return;
  }

  const color = SEVERITY_COLOR[event.severity] ?? '#6b7280';
  const payloadJson = JSON.stringify(event.payload ?? {}, null, 2);
  const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="margin:0 0 4px 0;font-size:20px;color:#111;">
        ⚠️ vAI Platform Error
      </h2>
      <p style="margin:0 0 20px 0;color:#6b7280;font-size:13px;">${now} ET</p>

      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr>
          <td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:600;width:140px;">Severity</td>
          <td style="padding:8px 12px;border:1px solid #e5e7eb;">
            <span style="background:${color};color:#fff;padding:2px 10px;border-radius:9999px;font-size:12px;font-weight:700;text-transform:uppercase;">
              ${event.severity}
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:600;">Event Type</td>
          <td style="padding:8px 12px;border:1px solid #e5e7eb;font-family:monospace;">${event.event_type}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:600;">Function</td>
          <td style="padding:8px 12px;border:1px solid #e5e7eb;font-family:monospace;">${event.function_name ?? '—'}</td>
        </tr>
      </table>

      <h3 style="margin:20px 0 8px 0;font-size:14px;color:#374151;">Payload</h3>
      <pre style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:6px;padding:12px;font-size:12px;overflow-x:auto;white-space:pre-wrap;">${payloadJson}</pre>

      <p style="margin:24px 0 0 0;font-size:12px;color:#9ca3af;">
        Sent by triage-webhook · nextvillage.community
      </p>
    </div>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    fromEmail,
      to:      [toEmail],
      subject: `[vAI ${event.severity.toUpperCase()}] ${event.event_type} in ${event.function_name ?? 'unknown'}`,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`[triage-webhook] Resend failed: ${response.status}`, body);
  } else {
    console.log(`[triage-webhook] Alert email sent for ${event.event_type} in ${event.function_name}`);
  }
}

// ─── Verify Supabase webhook signature ───────────────────────────────────────

function verifySignature(req: VercelRequest, rawBody: string): boolean {
  const secret = process.env.TRIAGE_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[triage-webhook] TRIAGE_WEBHOOK_SECRET not set — skipping signature check (dev mode)');
    return true;
  }

  const signature = req.headers['x-supabase-signature'] as string;
  if (!signature) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(`sha256=${expected}`),
    );
  } catch {
    return false;
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = JSON.stringify(req.body);

  if (!verifySignature(req, rawBody)) {
    console.warn('[triage-webhook] Invalid signature — request rejected');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { type, record } = req.body || {};

  if (type !== 'INSERT' || !record) {
    return res.status(200).json({ message: 'Ignored — not an INSERT event' });
  }

  const { event_type, function_name, severity, payload } = record;

  if (!ACTIONABLE_EVENTS.has(event_type) || !ACTIONABLE_SEVERITIES.has(severity)) {
    return res.status(200).json({ message: `Ignored — ${event_type} / ${severity} not actionable` });
  }

  const dedupKey = `${event_type}:${function_name}`;
  if (await isDuplicate(dedupKey)) {
    console.log(`[triage-webhook] Deduped ${dedupKey} — already alerted recently`);
    return res.status(200).json({ message: 'Deduplicated — already alerted' });
  }

  await sendAlertEmail({ event_type, function_name, severity, payload });

  return res.status(200).json({
    message:       'Alert email sent',
    event_type,
    function_name,
    severity,
  });
}