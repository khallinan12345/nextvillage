/**
 * api/seriousness-report.ts
 *
 * Monthly learner-effort ("seriousness") report. For the previous calendar month
 * it reviews every enrolled learner at the Oloibiri site who had sessions,
 * stores a rating per learner, and emails one report to the recipients listed in
 * report_recipients (report = 'seriousness_report').
 *
 * What it looks at: effort and relevance in the learner's replies across their
 * dashboard sessions, AI Playground chats and Prompt Challenge attempts that
 * month. Never spelling or English level. Names are never sent to the model.
 *
 * Runs twice on the 3rd (vercel.json) so a large month can finish: the first run
 * rates as many learners as fit in the time budget; the second continues and,
 * once every learner has a rating, sends the email. Safe to run again: learners
 * already rated are skipped and a month is emailed only once.
 *
 * Auth:  "Authorization: Bearer $CRON_SECRET" (Vercel cron) or "x-cron-secret".
 * Query: ?month=YYYY-MM  review a specific month (default: previous month)
 *        ?send=0         rate and store, but do not email (to check results first)
 *        ?force=1        email again even if this month was already sent
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, RESEND_API_KEY, CRON_SECRET
 */

import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { logApiCost } from "../lib/api-cost-logger.js";
import {
  MIN_MESSAGES,
  SYSTEM_PROMPT,
  buildJudgePrompt,
  buildReport,
  computeSignals,
  inWindow,
  parseJudgement,
  parseMessages,
  sampleMessages,
} from "./_lib/seriousness.js";

const MODEL = "claude-sonnet-5-5";
const REPORT = "seriousness_report";
const TIME_BUDGET_MS = 240_000;
const CONCURRENCY = 5;
const PAGE = 200;
const CHUNK = 25;

// The Oloibiri site: the main organization plus its duplicate records
// (mirrors site_org_id() in the database).
const MAIN_ORG = "a1b2c3d4-0001-0001-0001-000000000001";
const SITE_ORG_IDS = new Set([
  MAIN_ORG,
  "00bd2a68-7ae4-4e70-82de-455e865a9a48",
  "85f12740-d3bf-4f50-b36b-15dc4428bd08",
  "545d286d-2045-4792-92e5-f2fbec2e895e",
  "089cc033-e2c6-4227-b87f-9e27692c57d6",
]);

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Learner { id: string; name: string | null }
type Conversations = unknown[][]; // parsed message lists (see parseMessages)

function isSiteLearner(p: { organization_id: string | null; city: string | null }): boolean {
  if (p.organization_id) return SITE_ORG_IDS.has(p.organization_id);
  return /^oloibiri/i.test(p.city ?? "");
}

function monthWindow(param: string | undefined) {
  let y: number;
  let m: number; // the month under review, 1-12
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    y = Number(param.slice(0, 4));
    m = Number(param.slice(5, 7));
  } else {
    const now = new Date();
    y = now.getUTCFullYear();
    m = now.getUTCMonth(); // 0-11 for the current month, which is 1-12 for the previous one
    if (m === 0) { m = 12; y -= 1; }
  }
  const start = Date.UTC(y, m - 1, 1);
  const end = Date.UTC(y, m, 1);
  const prev = Date.UTC(y, m - 2, 1);
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return {
    start, end,
    monthKey: iso(start),
    prevKey: iso(prev),
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

async function loadConversations(ids: string[], start: number, end: number): Promise<Map<string, Conversations>> {
  const map = new Map<string, Conversations>();
  const add = (userId: string, raw: unknown) => {
    const msgs = inWindow(parseMessages(raw), start, end);
    if (msgs.length === 0) return;
    if (!map.has(userId)) map.set(userId, []);
    map.get(userId)!.push(msgs);
  };
  const startIso = new Date(start).toISOString();
  const endIso = new Date(end).toISOString();

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);

    const dash = await pagedSelect<{ user_id: string; chat_history: unknown }>((from, to) =>
      supabase.from("dashboard").select("user_id, chat_history")
        .in("user_id", chunk).gte("updated_at", startIso).not("chat_history", "is", null)
        .order("id").range(from, to));
    dash.forEach((r) => add(r.user_id, r.chat_history));

    const play = await pagedSelect<{ user_id: string; messages: unknown }>((from, to) =>
      supabase.from("ai_playground_chats").select("user_id, messages")
        .in("user_id", chunk).gte("updated_at", startIso).order("id").range(from, to));
    play.forEach((r) => add(r.user_id, r.messages));

    const anchor = await pagedSelect<{ user_id: string; transcript: unknown }>((from, to) =>
      supabase.from("anchor_attempts").select("user_id, transcript")
        .in("user_id", chunk).gte("completed_at", startIso).lt("completed_at", endIso)
        .order("id").range(from, to));
    anchor.forEach((r) => add(r.user_id, r.transcript));
  }
  return map;
}

async function judge(prompt: string, userId: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    // Sonnet 5.5 rejects a non-default temperature, so none is sent.
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error ${response.status}: ${JSON.stringify(err.error ?? err)}`);
  }
  const data = await response.json();
  logApiCost({ source: "seriousness_report", model: MODEL, action: "judge", usage: data.usage, user_id: userId });
  return data.content[0].text;
}

async function mapPool<T>(items: T[], size: number, deadline: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length && Date.now() < deadline) {
      const item = items[next++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = !!cronSecret && req.headers["authorization"] === `Bearer ${cronSecret}`;
  const isManual = !!cronSecret && req.headers["x-cron-secret"] === cronSecret;
  if (!isVercelCron && !isManual) return res.status(401).json({ error: "Unauthorized" });

  const started = Date.now();
  const win = monthWindow(req.query.month as string | undefined);
  const sendEmail = req.query.send !== "0";
  const force = req.query.force === "1";

  try {
    // 1. Enrolled learners at the site
    const profiles = await pagedSelect<{ id: string; name: string | null; organization_id: string | null; city: string | null }>((from, to) =>
      supabase.from("profiles").select("id, name, organization_id, city")
        .in("role", ["student", "learner"]).eq("membership_status", "approved").order("id").range(from, to));
    const learners: Learner[] = profiles.filter(isSiteLearner).map((p) => ({ id: p.id, name: p.name }));

    // 2. Who is already rated for this month
    const existing = await pagedSelect<{ user_id: string }>((from, to) =>
      supabase.from("seriousness_reviews").select("user_id").eq("month", win.monthKey).order("user_id").range(from, to));
    const rated = new Set(existing.map((r) => r.user_id));

    // 3. Conversations for learners still to rate
    const todoIds = learners.filter((l) => !rated.has(l.id)).map((l) => l.id);
    const conversations = await loadConversations(todoIds, win.start, win.end);

    // 4. Rate each learner who replied at least once this month
    const errors: string[] = [];
    let judged = 0;
    let insufficient = 0;
    const signalsById = new Map<string, ReturnType<typeof computeSignals>>();
    for (const id of todoIds) {
      const convos = conversations.get(id);
      if (!convos) continue;
      const signals = computeSignals(convos as never);
      if (signals.learnerMessages > 0) signalsById.set(id, signals);
    }
    const active = [...signalsById.keys()];
    await mapPool(active, CONCURRENCY, started + TIME_BUDGET_MS, async (id) => {
      try {
        const convos = conversations.get(id)!;
        const signals = signalsById.get(id)!;
        let rating: string;
        let reason = "";
        if (signals.learnerMessages < MIN_MESSAGES) {
          rating = "insufficient";
          insufficient++;
        } else {
          const reply = await judge(buildJudgePrompt(signals, sampleMessages(convos as never)), id);
          ({ rating, reason } = parseJudgement(reply));
          judged++;
        }
        const { error } = await supabase.from("seriousness_reviews").upsert(
          { user_id: id, month: win.monthKey, rating, reason, signals, model: rating === "insufficient" ? null : MODEL },
          { onConflict: "user_id,month" }
        );
        if (error) throw new Error(error.message);
      } catch (err) {
        errors.push(`${id}: ${(err as Error).message}`);
      }
    });

    // 5. Is every active learner rated now?
    const nowRated = await pagedSelect<{ user_id: string; rating: string; reason: string | null }>((from, to) =>
      supabase.from("seriousness_reviews").select("user_id, rating, reason").eq("month", win.monthKey).order("user_id").range(from, to));
    const ratedIds = new Set(nowRated.map((r) => r.user_id));
    const pending = active.filter((id) => !ratedIds.has(id)).length;
    const summary = { month: win.monthKey, learnersEnrolled: learners.length, judged, insufficient, pending, errors };

    if (pending > 0) return res.status(200).json({ ...summary, complete: false, emailed: false });
    if (!sendEmail) return res.status(200).json({ ...summary, complete: true, emailed: false, note: "send=0" });

    // 6. Email once per month
    const { data: runRow } = await supabase.from("seriousness_report_runs").select("month").eq("month", win.monthKey).maybeSingle();
    if (runRow && !force) return res.status(200).json({ ...summary, complete: true, emailed: false, note: "already sent" });

    const { data: recipients, error: recErr } = await supabase.from("report_recipients").select("email").eq("report", REPORT).eq("active", true);
    if (recErr) throw new Error(recErr.message);
    const to = (recipients ?? []).map((r: { email: string }) => r.email);
    if (to.length === 0) return res.status(200).json({ ...summary, complete: true, emailed: false, note: "no active recipients" });

    const prevRows = await pagedSelect<{ user_id: string; rating: string }>((from, to2) =>
      supabase.from("seriousness_reviews").select("user_id, rating").eq("month", win.prevKey).order("user_id").range(from, to2));
    const prevMap = new Map(prevRows.map((r) => [r.user_id, r.rating]));
    const nameOf = new Map(learners.map((l) => [l.id, l.name]));

    const rows = nowRated
      .filter((r) => nameOf.has(r.user_id))
      .map((r) => ({ name: nameOf.get(r.user_id) ?? null, rating: r.rating, reason: r.reason ?? "", previous: prevMap.get(r.user_id) ?? null }));
    const report = buildReport({ monthLabel: win.label, rows, noActivityCount: Math.max(0, learners.length - rows.length) });

    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "nextVillage Reports <reports@nextvillage.community>",
        to,
        subject: report.subject,
        html: report.html,
        text: report.text,
      }),
    });
    if (!send.ok) throw new Error(`Resend error ${send.status}: ${await send.text()}`);

    await supabase.from("seriousness_report_runs").upsert(
      { month: win.monthKey, sent_at: new Date().toISOString(), recipients: to.length, counts: report.counts },
      { onConflict: "month" }
    );
    return res.status(200).json({ ...summary, complete: true, emailed: true, recipients: to.length, counts: report.counts });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
}
