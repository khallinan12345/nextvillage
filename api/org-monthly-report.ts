/**
 * api/org-monthly-report.ts
 *
 * Monthly progress report for a partner organization's leaders (the partnership agreement promises
 * one). For the previous calendar month it takes each approved learner at the organization, reads
 * the scores the monthly assessment already stored, and emails one report per organization to the
 * people listed in report_recipients (report = 'org_progress:<organization id>').
 *
 * The report holds scores, movement since last month, sessions and certifications only (see
 * api/_lib/orgProgressReport.js). No AI call is made here, and nothing a learner wrote is read.
 * An organization with no active recipient gets nothing.
 *
 * Auth:  "Authorization: Bearer $CRON_SECRET" (Vercel cron) or "x-cron-secret: $CRON_SECRET".
 * Query: ?org=<id>          one organization (default: every organization that has recipients)
 *        ?month=YYYY-MM     report on a specific month (default: previous month)
 *        ?send=1            actually email the recipients (default: dry run, nothing is sent)
 *        ?preview_to=<addr> email the report to this one address only, marked PREVIEW (for checking)
 *        ?force=1           send again even if this month was already sent
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, CRON_SECRET
 */

import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from './_lib/vercelTypes';
import { buildOrgReport, pickScores } from "./_lib/orgProgressReport.js";

const PAGE = 200;
const CHUNK = 100;

// The Oloibiri site: the main organization plus its duplicate records (mirrors site_org_id() in the
// database), and learners there who have not been placed in an organization yet.
const OLOIBIRI = "a1b2c3d4-0001-0001-0001-000000000001";
const OLOIBIRI_IDS = new Set([
  OLOIBIRI,
  "00bd2a68-7ae4-4e70-82de-455e865a9a48",
  "85f12740-d3bf-4f50-b36b-15dc4428bd08",
  "545d286d-2045-4792-92e5-f2fbec2e895e",
  "089cc033-e2c6-4227-b87f-9e27692c57d6",
]);

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ProfileRow { id: string; name: string | null; organization_id: string | null; city: string | null }

function monthWindow(param: string | undefined) {
  let y: number;
  let m: number; // the month under review, 1-12
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    y = Number(param.slice(0, 4));
    m = Number(param.slice(5, 7));
  } else {
    const now = new Date();
    y = now.getUTCFullYear();
    m = now.getUTCMonth();
    if (m === 0) { m = 12; y -= 1; }
  }
  const iso = (ms: number) => new Date(ms).toISOString();
  const start = Date.UTC(y, m - 1, 1);
  return {
    start: iso(start),
    end: iso(Date.UTC(y, m, 1)),
    prevStart: iso(Date.UTC(y, m - 2, 1)),
    monthKey: iso(start).slice(0, 10),
    label: new Date(start).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
  };
}

async function pagedSelect<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

function belongs(p: ProfileRow, orgId: string): boolean {
  if (orgId === OLOIBIRI) {
    if (p.organization_id) return OLOIBIRI_IDS.has(p.organization_id);
    return /^oloibiri/i.test(p.city ?? "");
  }
  return p.organization_id === orgId;
}

type ScoreRow = Record<string, unknown> & { user_id: string; measured_at: string };

/** The latest assessment per learner inside [from, to). */
async function latestByUser(ids: string[], from: string, to: string): Promise<Map<string, ScoreRow>> {
  const map = new Map<string, ScoreRow>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const rows = await pagedSelect<ScoreRow>((a, b) =>
      supabase.from("user_monthly_assessments")
        .select("user_id, measured_at, cognitive_score, critical_thinking_score, problem_solving_score, creativity_score, session_count")
        .in("user_id", chunk).gte("measured_at", from).lt("measured_at", to).order("measured_at").order("user_id").range(a, b));
    for (const r of rows) {
      const cur = map.get(r.user_id);
      if (!cur || r.measured_at > cur.measured_at) map.set(r.user_id, r);
    }
  }
  return map;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = !!cronSecret && req.headers["authorization"] === `Bearer ${cronSecret}`;
  const isManual = !!cronSecret && req.headers["x-cron-secret"] === cronSecret;
  if (!isVercelCron && !isManual) return res.status(401).json({ error: "Unauthorized" });

  const win = monthWindow(req.query.month as string | undefined);
  const wantSend = req.query.send === "1";
  const previewTo = typeof req.query.preview_to === "string" ? req.query.preview_to.trim() : "";
  const force = req.query.force === "1";
  const onlyOrg = typeof req.query.org === "string" ? req.query.org : "";

  try {
    // 1. Which organizations have someone to send to
    const recips = await pagedSelect<{ report: string; email: string }>((a, b) =>
      supabase.from("report_recipients").select("report, email").like("report", "org_progress:%").eq("active", true).order("report").order("email").range(a, b));
    const byOrg = new Map<string, string[]>();
    for (const r of recips) {
      const id = r.report.slice("org_progress:".length);
      if (!byOrg.has(id)) byOrg.set(id, []);
      byOrg.get(id)!.push(r.email);
    }
    const orgIds = onlyOrg ? [onlyOrg] : [...byOrg.keys()];
    if (orgIds.length === 0) return res.status(200).json({ month: win.monthKey, organizations: [], note: "no organization has active recipients" });

    const { data: orgRows, error: orgErr } = await supabase.from("organizations").select("id, name").in("id", orgIds);
    if (orgErr) throw new Error(orgErr.message);
    const orgName = new Map((orgRows ?? []).map((o: { id: string; name: string | null }) => [o.id, o.name ?? "Your organization"]));

    // 2. Approved learners (one read, filtered per organization)
    const profiles = await pagedSelect<ProfileRow>((a, b) =>
      supabase.from("profiles").select("id, name, organization_id, city")
        .in("role", ["student", "learner"]).eq("membership_status", "approved").order("id").range(a, b));

    const results: Record<string, unknown>[] = [];
    for (const orgId of orgIds) {
      const name = orgName.get(orgId);
      if (!name) { results.push({ org: orgId, error: "organization not found" }); continue; }
      const learners = profiles.filter((p) => belongs(p, orgId));
      const ids = learners.map((l) => l.id);

      const current = await latestByUser(ids, win.start, win.end);
      const previous = await latestByUser(ids, win.prevStart, win.start);
      const rows = learners.map((l) => ({
        name: l.name,
        current: pickScores(current.get(l.id)),
        previous: pickScores(previous.get(l.id)),
      }));
      const report = buildOrgReport({ orgName: name, monthLabel: win.label, rows });
      const to = byOrg.get(orgId) ?? [];
      const summary = { org: orgId, name, month: win.monthKey, recipients: to.length, ...report.counts };

      if (previewTo) {
        const sent = await sendMail([previewTo], `PREVIEW: ${report.subject}`, report, "PREVIEW. Not sent to the organization's leaders. ");
        results.push({ ...summary, previewSentTo: previewTo, ok: sent });
        continue;
      }
      if (!wantSend) { results.push({ ...summary, sent: false, note: "dry run (add send=1 to email)" }); continue; }
      if (to.length === 0) { results.push({ ...summary, sent: false, note: "no active recipients" }); continue; }
      if (report.counts.scored === 0) { results.push({ ...summary, sent: false, note: "no learner has a score this month" }); continue; }

      const { data: ran, error: ranErr } = await supabase.from("org_progress_report_runs").select("org_id").eq("org_id", orgId).eq("month", win.monthKey).maybeSingle();
      if (ranErr) throw new Error(ranErr.message);
      if (ran && !force) { results.push({ ...summary, sent: false, note: "already sent this month" }); continue; }

      await sendMail(to, report.subject, report, "");
      const { error: upErr } = await supabase.from("org_progress_report_runs").upsert(
        { org_id: orgId, month: win.monthKey, sent_at: new Date().toISOString(), recipients: to.length, learner_count: report.counts.scored },
        { onConflict: "org_id,month" });
      if (upErr) throw new Error(upErr.message);
      results.push({ ...summary, sent: true });
    }
    return res.status(200).json({ month: win.monthKey, organizations: results });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
}

async function sendMail(to: string[], subject: string, report: { html: string; text: string }, banner: string): Promise<boolean> {
  const send = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "nextVillage Reports <reports@nextvillage.community>",
      to,
      subject,
      html: banner ? `<p style="font-family:system-ui;font-weight:700;color:#9b1c1c">${banner}</p>${report.html}` : report.html,
      text: `${banner}${report.text}`,
    }),
  });
  if (!send.ok) throw new Error(`Resend error ${send.status}: ${await send.text()}`);
  return true;
}
