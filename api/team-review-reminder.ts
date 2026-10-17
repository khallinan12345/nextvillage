/**
 * api/team-review-reminder.ts
 *
 * Monthly reminder for the Team workspace (/team). On the 1st of each month it emails:
 *   - the platform team (report_recipients, report = 'team_reminder_platform'): every review that is
 *     due, every open task, and change proposals waiting for triage;
 *   - leaders (report = 'team_reminder_leaders'): only items shared with all leaders.
 * Nothing is sent to an audience when it has nothing to report. No learner data is included.
 *
 * Auth:  "Authorization: Bearer $CRON_SECRET" (Vercel cron) or "x-cron-secret".
 * Query: ?send=0    build and return the messages without emailing (to check them first)
 *        ?force=1   send again even if this month was already sent
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, CRON_SECRET
 */

import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from './_lib/vercelTypes';
import { buildReminder } from "./_lib/teamReminder.js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const AUDIENCES = [
  { audience: "platform_team", report: "team_reminder_platform" },
  { audience: "all_leaders", report: "team_reminder_leaders" },
] as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = !!cronSecret && req.headers["authorization"] === `Bearer ${cronSecret}`;
  const isManual = !!cronSecret && req.headers["x-cron-secret"] === cronSecret;
  if (!isVercelCron && !isManual) return res.status(401).json({ error: "Unauthorized" });

  const send = req.query.send !== "0";
  const force = req.query.force === "1";

  try {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    if (send && !force) {
      const { data: already } = await supabase.from("system_events").select("id")
        .eq("event_type", "team_reminder_sent").gte("created_at", monthStart).limit(1);
      if (already && already.length > 0) return res.status(200).json({ sent: false, note: "already sent this month" });
    }

    const [reviews, tasks, proposals] = await Promise.all([
      supabase.from("review_items").select("title, cadence_days, last_reviewed_at, audience"),
      supabase.from("team_tasks").select("title, status, due_date, audience"),
      supabase.from("change_proposals").select("title, status"),
    ]);
    for (const r of [reviews, tasks, proposals]) if (r.error) throw new Error(r.error.message);

    const results: Record<string, unknown> = {};
    for (const { audience, report } of AUDIENCES) {
      const msg = buildReminder({
        audience, now,
        reviews: reviews.data ?? [], tasks: tasks.data ?? [], proposals: proposals.data ?? [],
      });
      if (!msg) { results[audience] = { sent: false, note: "nothing to report" }; continue; }

      const { data: recipients, error } = await supabase.from("report_recipients").select("email").eq("report", report).eq("active", true);
      if (error) throw new Error(error.message);
      const to = (recipients ?? []).map((r: { email: string }) => r.email);

      if (!send) { results[audience] = { sent: false, dryRun: true, recipients: to.length, counts: msg.counts, subject: msg.subject, text: msg.text }; continue; }
      if (to.length === 0) { results[audience] = { sent: false, note: "no active recipients", counts: msg.counts }; continue; }

      const out = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "nextVillage Team <reports@nextvillage.community>", to, subject: msg.subject, html: msg.html, text: msg.text }),
      });
      if (!out.ok) throw new Error(`Resend error ${out.status}: ${await out.text()}`);
      results[audience] = { sent: true, recipients: to.length, counts: msg.counts };
    }

    if (send && Object.values(results).some((r) => (r as { sent?: boolean }).sent)) {
      await supabase.from("system_events").insert({
        function_name: "team-review-reminder", event_type: "team_reminder_sent", severity: "info", payload: results,
      });
    }
    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
}
