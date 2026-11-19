/**
 * api/donation-reminders.ts
 *
 * Daily nudge while any donation is still missing its donor name (needs_donor), starting a day after it was
 * picked up (the intake email already prompted on day zero). Emails report_recipients where
 * report = 'donation_prompt'. Sends nothing when nothing is waiting.
 *
 * Auth:  "Authorization: Bearer $CRON_SECRET" (Vercel cron) or "x-cron-secret".
 * Query: ?send=0  build and return the message without emailing it
 * Env:   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, CRON_SECRET
 */

import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from './_lib/vercelTypes';
import { buildReminder } from "./_lib/donationPrompt.js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = !!cronSecret && req.headers["authorization"] === `Bearer ${cronSecret}`;
  const isManual = !!cronSecret && req.headers["x-cron-secret"] === cronSecret;
  if (!isVercelCron && !isManual) return res.status(401).json({ error: "Unauthorized" });

  const send = req.query.send !== "0";
  try {
    const cutoff = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
    const { data: pending, error } = await supabase.from("donations")
      .select("received_on, amount_usd").eq("needs_donor", true).lte("created_at", cutoff).order("received_on");
    if (error) throw new Error(error.message);

    const msg = buildReminder({ pending: pending ?? [] });
    if (!msg) return res.status(200).json({ sent: false, note: "nothing waiting" });

    const { data: rcpts, error: rErr } = await supabase.from("report_recipients").select("email").eq("report", "donation_prompt").eq("active", true);
    if (rErr) throw new Error(rErr.message);
    const to = (rcpts ?? []).map((r: { email: string }) => r.email);
    if (!send) return res.status(200).json({ sent: false, dryRun: true, recipients: to.length, waiting: pending!.length, text: msg.text });
    if (to.length === 0) return res.status(200).json({ sent: false, note: "no donation_prompt recipients", waiting: pending!.length });

    for (const addr of to) {
      const out = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "nextVillage Reports <reports@nextvillage.community>", to: [addr], subject: msg.subject, html: msg.html, text: msg.text }),
      });
      if (!out.ok) throw new Error(`Resend error ${out.status}: ${await out.text()}`);
    }
    return res.status(200).json({ sent: true, recipients: to.length, waiting: pending!.length });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
}
