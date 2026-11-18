/**
 * api/board-monthly-report.ts
 *
 * "Impact Mining Program News": monthly email to the board of directors, covering the previous
 * calendar month: new students per African organization, new certifications, new organizations,
 * sessions, AI costs and donations (recorded by hand, sent by Impact Mining, Inc. via Sendwave).
 * Counts only about learners: no learner names or work.
 * Two cron runs each month:
 *   3rd, 10:00 UTC  ?preview=1  a [Preview] copy to the address(es) in report_recipients with
 *                   report = 'board_monthly_preview' (Kevin), so it can be checked first
 *   5th, 10:00 UTC  the real send to every active row of the board_directors table
 * With no active directors nothing is sent.
 *
 * Auth:  "Authorization: Bearer $CRON_SECRET" (Vercel cron) or "x-cron-secret".
 * Query: ?preview=1           send the [Preview] copy to the preview recipients only
 *        ?send=0              build and return the report without emailing it
 *        ?preview_to=a@b.com  email the report to that one address only (not the board)
 *        ?month=YYYY-MM-01    report on a different month (default: the previous month)
 *        ?force=1             send again even if this month was already sent
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, CRON_SECRET
 */

import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from './_lib/vercelTypes';
import { buildBoardReport, previousMonth } from "./_lib/boardReport.js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const PREVIEW_REPORT = "board_monthly_preview";

async function sendEmail(to: string[], msg: { subject: string; html: string; text: string }) {
  const out = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "nextVillage Reports <reports@nextvillage.community>", to, subject: msg.subject, html: msg.html, text: msg.text }),
  });
  if (!out.ok) throw new Error(`Resend error ${out.status}: ${await out.text()}`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = !!cronSecret && req.headers["authorization"] === `Bearer ${cronSecret}`;
  const isManual = !!cronSecret && req.headers["x-cron-secret"] === cronSecret;
  if (!isVercelCron && !isManual) return res.status(401).json({ error: "Unauthorized" });

  const send = req.query.send !== "0";
  const force = req.query.force === "1";
  const preview = req.query.preview === "1";
  const previewTo = typeof req.query.preview_to === "string" ? req.query.preview_to.trim() : "";

  try {
    let month = previousMonth();
    if (typeof req.query.month === "string") {
      if (!/^\d{4}-\d{2}-01$/.test(req.query.month)) return res.status(400).json({ error: "month must look like 2026-10-01" });
      const d = new Date(`${req.query.month}T00:00:00Z`);
      month = { start: req.query.month, label: `${d.toLocaleString("en-US", { month: "long", timeZone: "UTC" })} ${d.getUTCFullYear()}` };
    }

    const isBoardSend = send && !previewTo && !preview;
    if (isBoardSend && !force) {
      const { data: already } = await supabase.from("system_events").select("id")
        .eq("event_type", "board_report_sent").eq("payload->>month", month.start).limit(1);
      if (already && already.length > 0) return res.status(200).json({ sent: false, note: `already sent for ${month.label}` });
    }

    const { data: stats, error } = await supabase.rpc("get_board_monthly_stats", { p_month_start: month.start });
    if (error) throw new Error(error.message);
    // Donations are fetched separately; if that fails the report still goes out without the section.
    const { data: donations, error: dErr } = await supabase.rpc("get_board_donations", { p_month_start: month.start });
    if (dErr) console.error("board report: get_board_donations failed:", dErr.message);
    const msg = buildBoardReport({ stats, donations: dErr ? null : donations, monthLabel: month.label });

    const previewMsg = { ...msg, subject: `[Preview] ${msg.subject}` };
    if (previewTo) {
      await sendEmail([previewTo], previewMsg);
      return res.status(200).json({ sent: true, preview: true, to: previewTo, counts: msg.counts });
    }
    if (preview) {
      const { data: pv, error: pErr } = await supabase.from("report_recipients").select("email").eq("report", PREVIEW_REPORT).eq("active", true);
      if (pErr) throw new Error(pErr.message);
      const pto = (pv ?? []).map((r: { email: string }) => r.email);
      if (pto.length === 0) return res.status(200).json({ sent: false, note: "no preview recipients", counts: msg.counts });
      if (!send) return res.status(200).json({ sent: false, dryRun: true, preview: true, recipients: pto.length, subject: previewMsg.subject, text: msg.text });
      for (const addr of pto) await sendEmail([addr], previewMsg);
      return res.status(200).json({ sent: true, preview: true, recipients: pto.length, counts: msg.counts });
    }

    const { data: directors, error: rErr } = await supabase.from("board_directors").select("email").eq("active", true);
    if (rErr) throw new Error(rErr.message);
    const to = (directors ?? []).map((r: { email: string }) => r.email);

    if (!send) return res.status(200).json({ sent: false, dryRun: true, recipients: to.length, counts: msg.counts, subject: msg.subject, text: msg.text });
    if (to.length === 0) return res.status(200).json({ sent: false, note: "no active directors", counts: msg.counts });

    // One message per person so nobody's address is shown to the rest of the board.
    for (const addr of to) await sendEmail([addr], msg);
    await supabase.from("system_events").insert({
      function_name: "board-monthly-report", event_type: "board_report_sent", severity: "info",
      payload: { month: month.start, recipients: to.length, counts: msg.counts },
    });
    return res.status(200).json({ sent: true, recipients: to.length, counts: msg.counts });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
}
