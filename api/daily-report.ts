/**
 * DAILY ACTIVITY REPORT — Vercel Cron Handler
 *
 * Runs every day at 11:00 UTC (12:00 Nigerian WAT / West Africa Time = UTC+1).
 * Vercel cron: "0 11 * * *"
 *
 * Reports on EVERY user (site-wide, not limited to any cohort) who signed
 * in today:
 *   • One row per signed-in user: sign-in time, name, email, city, country,
 *     organization, and every page/category they touched today.
 *   • A previous Africa-cohort-only version filtered to continent='Africa'
 *     OR one of three org IDs, which silently dropped users with a blank
 *     continent/org (most of the missing users people noticed in the
 *     email). This version has no cohort filter — everyone who signed in
 *     today gets a row.
 *   • "Active Today" (header stat) stays a union of sign-ins AND real
 *     product usage (dashboard/AI Playground/Systems Think/agriculture),
 *     since persistSession + autoRefreshToken means a returning user's
 *     session can refresh silently without updating last_sign_in_at —
 *     login alone would undercount that stat. The per-user TABLE below it
 *     is keyed strictly off sign-ins, which is what was asked for.
 *
 * Sends email to khallinan1@udayton.edu.
 * Writes a summary row to public.daily_activity_log in Supabase.
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, CRON_SECRET
 */

import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// ─── Excluded Users (admins / facilitators) ───────────────────────────────────
const EXCLUDED_USER_IDS = new Set([
  "0e738663-a70e-4fd3-9ba6-718c02e116c2", // Kevin Hallinan (kevin.hallinan@udayton.edu)
  "8b3f70dc-e5d0-4eb0-af7d-ec6181968213", // Kevin Hallinan (khallinan1@udayton.edu)
  "5d5e0486-e768-4c5d-ba63-d1e4570a352d", // Kevin Hallinan (kevin.hallinan.ud@gmail.com)
  "40e9daa6-7ec1-49a9-9be7-814a3d607d86", // Bennywhite Davidson (benny090davidson@gmail.com)
  "73da14c1-e49a-4410-9390-6fe069fd7528", // Bennywhite Davidson (duplicate)
  "f6157a9d-5ffd-4058-b0b3-af3ea897d876", // Bennywhite Davidson (bennywhite090d@gmail.com)
]);

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  city: string | null;
  country: string | null;
  organization: string | null;
  lastSignInAt: string;
  pages: string[];
}

interface DailySummary {
  logDate: string;
  totalRegisteredUsers: number;
  signedInToday: number;
  activeToday: number; // union of sign-in + activity
  rows: UserRow[];
  categoryTotals: Record<string, number>;
}

interface DailyCostSummary {
  totalCostUsd: number;
  anthropicCostUsd: number;
  groqRequests: number;
  anthropicRequests: number;
  cacheHitTokens: number;
  totalInputTokens: number;
  cacheSavingsUsd: number;
  byPage: { page: string; cost: number; requests: number; provider: string }[];
  available: boolean;
}

// ─── Chunked query helper ─────────────────────────────────────────────────────
const CHUNK_SIZE = 50;

async function inChunks<T>(
  ids: string[],
  fetcher: (chunk: string[]) => Promise<T[]>
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const rows = await fetcher(ids.slice(i, i + CHUNK_SIZE));
    results.push(...rows);
  }
  return results;
}

// ─── Auth Login Fetching ───────────────────────────────────────────────────────
// auth.users.last_sign_in_at is maintained by Supabase Auth itself, but ONLY
// on a genuine new sign-in. Paginated in case the user base grows past what
// a single page returns.

async function fetchAllAuthUsers(): Promise<Map<string, string | null>> {
  const loginMap = new Map<string, string | null>();
  const perPage = 1000;
  let page = 1;

  while (true) {
    const url = `${process.env.SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`;
    const res = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!res.ok) {
      console.warn("   auth admin users fetch failed:", res.status, await res.text());
      break;
    }
    const data = await res.json();
    const users: { id: string; last_sign_in_at: string | null }[] = data.users || [];
    users.forEach((u) => loginMap.set(u.id, u.last_sign_in_at));
    if (users.length < perPage) break;
    page++;
  }

  return loginMap;
}

// ─── Data Fetching ────────────────────────────────────────────────────────────

function todayWAT(): string {
  const now = new Date();
  const wat = new Date(now.getTime() + 60 * 60 * 1000);
  return wat.toISOString().split("T")[0];
}

async function fetchDailySummary(
  logDate: string,
  loginMap: Map<string, string | null>
): Promise<DailySummary> {
  const dayStartUTC = new Date(`${logDate}T00:00:00+01:00`).toISOString();
  const dayEndUTC   = new Date(`${logDate}T23:59:59+01:00`).toISOString();

  // ── Total registered users (excluding admins) ──────────────────────────
  const { count: totalRegisteredUsers } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true });

  // ── Who signed in today, site-wide (no cohort filter) ───────────────────
  const signedInIds = [...loginMap.entries()]
    .filter(([id, t]) => !EXCLUDED_USER_IDS.has(id) && !!t && t >= dayStartUTC && t <= dayEndUTC)
    .map(([id]) => id);

  // ── Activity today, site-wide (no cohort filter) ────────────────────────
  const dateFilter = (col1: string, col2: string) =>
    `and(${col1}.gte.${dayStartUTC},${col1}.lte.${dayEndUTC}),and(${col2}.gte.${dayStartUTC},${col2}.lte.${dayEndUTC})`;

  const [{ data: dashRows }, { data: pgRows }, { data: stRows }, { data: agRows }] = await Promise.all([
    supabase.from("dashboard").select("user_id, category_activity, activity")
      .or(dateFilter("created_at", "updated_at")),
    supabase.from("ai_playground_chats").select("user_id")
      .or(dateFilter("created_at", "updated_at")),
    supabase.from("systems_think_sessions").select("user_id")
      .or(dateFilter("created_at", "updated_at")),
    supabase.from("agriculture_consultations").select("youth_user_id")
      .or(dateFilter("created_at", "updated_at")),
  ]);

  // ── Per-user pages touched today ────────────────────────────────────────
  const pagesByUser = new Map<string, Set<string>>();
  const addPage = (userId: string | null | undefined, label: string) => {
    if (!userId) return;
    if (!pagesByUser.has(userId)) pagesByUser.set(userId, new Set());
    pagesByUser.get(userId)!.add(label);
  };
  for (const row of dashRows || []) {
    addPage(row.user_id, row.category_activity || "Unknown");
  }
  for (const row of pgRows || []) addPage(row.user_id, "AI Playground");
  for (const row of stRows || []) addPage(row.user_id, "Systems Think");
  for (const row of agRows || []) addPage((row as any).youth_user_id, "Agriculture Consultation");

  // ── Active today: union of sign-ins + any activity signal ──────────────
  const activeUserIds = new Set<string>([
    ...signedInIds,
    ...pagesByUser.keys(),
  ]);
  for (const id of EXCLUDED_USER_IDS) activeUserIds.delete(id);

  // ── Category totals across all active users (for the summary line) ────
  const categoryTotals: Record<string, number> = {};
  for (const [userId, pages] of pagesByUser) {
    if (EXCLUDED_USER_IDS.has(userId)) continue;
    for (const p of pages) categoryTotals[p] = (categoryTotals[p] || 0) + 1;
  }

  // ── Profiles for everyone who signed in today ───────────────────────────
  const profileRows = await inChunks(signedInIds, async (chunk) => {
    const { data } = await supabase
      .from("profiles")
      .select("id, name, email, city, country, organization_id")
      .in("id", chunk);
    return data || [];
  });

  const orgIds = [...new Set(profileRows.map((p) => p.organization_id).filter(Boolean))] as string[];
  const { data: orgRows } = orgIds.length
    ? await supabase.from("organizations").select("id, name").in("id", orgIds)
    : { data: [] as { id: string; name: string }[] };
  const orgMap = new Map((orgRows || []).map((o) => [o.id, o.name]));

  const profileMap = new Map(profileRows.map((p) => [p.id, p]));

  const rows: UserRow[] = signedInIds
    .map((id) => {
      const p = profileMap.get(id);
      return {
        id,
        name: p?.name ?? null,
        email: p?.email ?? "(unknown)",
        city: p?.city ?? null,
        country: p?.country ?? null,
        organization: p?.organization_id ? orgMap.get(p.organization_id) ?? null : null,
        lastSignInAt: loginMap.get(id)!,
        pages: [...(pagesByUser.get(id) || [])],
      };
    })
    .sort((a, b) => (a.lastSignInAt < b.lastSignInAt ? 1 : -1));

  return {
    logDate,
    totalRegisteredUsers: totalRegisteredUsers ?? 0,
    signedInToday: signedInIds.length,
    activeToday: activeUserIds.size,
    rows,
    categoryTotals,
  };
}

// ─── Cost Fetching ───────────────────────────────────────────────────────────

const PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6":         { input: 3.00,  output: 15.00 },
  "claude-haiku-5-5": { input: 0.10,  output: 0.50  },  // $/MTok, prompts up to 100k
  "claude-haiku-4-5": { input: 1.00,  output: 5.00  },
  "llama-3.3-70b-versatile":   { input: 0.00,  output: 0.00  },
};

async function fetchDailyCosts(
  dayStartUTC: string,
  dayEndUTC: string
): Promise<DailyCostSummary> {
  const empty: DailyCostSummary = {
    totalCostUsd: 0, anthropicCostUsd: 0,
    groqRequests: 0, anthropicRequests: 0,
    cacheHitTokens: 0, totalInputTokens: 0, cacheSavingsUsd: 0,
    byPage: [], available: false,
  };

  try {
    const { data, error } = await supabase.from("api_cost_log").select("page, provider, model, input_tokens, output_tokens, cache_hit_tokens, estimated_cost_usd").gte("logged_at", dayStartUTC).lte("logged_at", dayEndUTC).limit(10000);

    if (error) {
      console.warn("   api_cost_log not available:", error.message);
      return empty;
    }

    const rows = data || [];
    if (rows.length === 0) return {...empty, available: true };

    const totalCostUsd      = rows.reduce((s, r) => s + (r.estimated_cost_usd || 0), 0);
    const anthropicCostUsd  = rows.filter(r => r.provider === "anthropic").reduce((s, r) => s + (r.estimated_cost_usd || 0), 0);
    const groqRequests      = rows.filter(r => r.provider === "groq").length;
    const anthropicRequests = rows.filter(r => r.provider === "anthropic").length;
    const cacheHitTokens    = rows.reduce((s, r) => s + (r.cache_hit_tokens || 0), 0);
    const totalInputTokens  = rows.reduce((s, r) => s + (r.input_tokens || 0), 0);
    const cacheSavingsUsd   = rows.reduce((s, r) => {
      const p = PRICING_PER_MTOK[r.model] || { input: 0, output: 0 };
      return s + ((r.cache_hit_tokens || 0) / 1_000_000) * p.input * 0.90;
    }, 0);

    const pageMap = new Map<string, { cost: number; requests: number; provider: string }>();
    rows.forEach(r => {
      const existing = pageMap.get(r.page) || { cost: 0, requests: 0, provider: r.provider };
      pageMap.set(r.page, {
        cost:     existing.cost + (r.estimated_cost_usd || 0),
        requests: existing.requests + 1,
        provider: r.provider,
      });
    });

    const byPage = [...pageMap.entries()].map(([page, val]) => ({ page,...val })).sort((a, b) => b.cost - a.cost).slice(0, 10);

    return {
      totalCostUsd, anthropicCostUsd, groqRequests, anthropicRequests,
      cacheHitTokens, totalInputTokens, cacheSavingsUsd,
      byPage, available: true,
    };
  } catch (err: any) {
    console.warn("   fetchDailyCosts error:", err.message);
    return empty;
  }
}

// ─── Email HTML ───────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }) + " UTC";
}

function pagePills(pages: string[]): string {
  if (!pages.length) return `<span style="color:#9ca3af;font-style:italic;font-size:11px;">no logged activity</span>`;
  return pages.map((p) => `
    <span style="display:inline-block;font-size:10.5px;padding:2px 8px;margin:0 4px 4px 0;border:1px solid #c9d9cd;border-radius:20px;color:#374151;background:#eef3ef;white-space:nowrap;">${esc(p)}</span>
  `).join("");
}

function buildUserTable(rows: UserRow[]): string {
  if (!rows.length) {
    return `<div style="padding:16px;text-align:center;color:#6b7280;font-size:12px;">No sign-ins today.</div>`;
  }

  const trs = rows.map((r) => `
    <tr style="border-top:1px solid #e5e7eb;">
      <td style="padding:9px 10px;font-family:monospace;font-size:11px;color:#55685d;white-space:nowrap;">${fmtTime(r.lastSignInAt)}</td>
      <td style="padding:9px 10px;">
        <div style="font-weight:600;font-size:12.5px;color:#16261c;">${esc(r.name || "(no name)")}</div>
        <div style="font-size:10.5px;color:#8a988d;">${esc(r.email)}</div>
      </td>
      <td style="padding:9px 10px;font-size:12px;color:#16261c;white-space:nowrap;">${r.city ? esc(r.city) : '<span style="color:#9ca3af;">—</span>'}</td>
      <td style="padding:9px 10px;font-size:12px;color:#16261c;white-space:nowrap;">${r.country ? esc(r.country) : '<span style="color:#9ca3af;">—</span>'}</td>
      <td style="padding:9px 10px;font-size:11.5px;color:#55685d;">${r.organization ? esc(r.organization) : '<span style="color:#9ca3af;">—</span>'}</td>
      <td style="padding:9px 10px;min-width:220px;">${pagePills(r.pages)}</td>
    </tr>`).join("");

  return `
  <table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead>
      <tr style="background:#eef3ef;">
        <th style="padding:8px 10px;text-align:left;font-size:9.5px;color:#55685d;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">Time</th>
        <th style="padding:8px 10px;text-align:left;font-size:9.5px;color:#55685d;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">Name</th>
        <th style="padding:8px 10px;text-align:left;font-size:9.5px;color:#55685d;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">City</th>
        <th style="padding:8px 10px;text-align:left;font-size:9.5px;color:#55685d;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">Country</th>
        <th style="padding:8px 10px;text-align:left;font-size:9.5px;color:#55685d;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">Organization</th>
        <th style="padding:8px 10px;text-align:left;font-size:9.5px;color:#55685d;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">Pages Used Today</th>
      </tr>
    </thead>
    <tbody>${trs}</tbody>
  </table>`;
}

function buildCostSection(cost: DailyCostSummary): string {
  if (!cost.available) {
    return `
  <div style="margin:20px 0;padding:14px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;font-size:11px;color:#92400e;">
    <strong>API cost tracking not yet active.</strong> Deploy the updated <code>chat.js</code> and run <code>create_api_cost_log.sql</code> in Supabase to enable daily cost reporting.
  </div>`;
  }

  if (cost.anthropicRequests === 0 && cost.groqRequests === 0) {
    return `
  <div style="margin:20px 0;padding:14px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;font-size:11px;color:#6b7280;">
    No API calls logged today.
  </div>`;
  }

  const fmtCost = (n: number) => n < 0.001 ? "<$0.001" : `$${n.toFixed(3)}`;
  const cacheRate = cost.totalInputTokens > 0
    ? Math.round(cost.cacheHitTokens / cost.totalInputTokens * 100)
    : 0;

  const pageRows = cost.byPage.map(p => {
    const isGroq = p.provider === "groq";
    return `
    <tr style="border-top:1px solid #e5e7eb;">
      <td style="padding:5px 10px;font-size:11px;color:#374151;">${p.page}</td>
      <td style="padding:5px 10px;text-align:center;">
        <span style="font-size:9px;padding:2px 6px;border-radius:10px;font-weight:600;background:${isGroq ? "#d1fae5" : "#dbeafe"};color:${isGroq ? "#065f46" : "#1e40af"};">
          ${isGroq ? "Groq" : "Anthropic"}
        </span>
      </td>
      <td style="padding:5px 10px;text-align:center;font-size:11px;color:#374151;">${p.requests}</td>
      <td style="padding:5px 10px;text-align:right;font-size:11px;font-weight:600;color:${p.cost > 0.01 ? "#991b1b" : "#374151"};">${fmtCost(p.cost)}</td>
    </tr>`;
  }).join("");

  return `
  <div style="margin:20px 0;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:linear-gradient(135deg,#1e1b4b 0%,#312e81 100%);padding:14px 20px;">
      <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#a5b4fc;margin-bottom:3px;font-weight:600;">API Cost Report</div>
      <div style="font-size:15px;font-weight:700;color:#fff;">Today's AI Spend</div>
    </div>
    <div style="padding:16px 20px;">

      <!-- KPI chips -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
        <div style="flex:1;min-width:100px;background:#eff6ff;border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:20px;font-weight:800;color:#1e40af;">${fmtCost(cost.anthropicCostUsd)}</div>
          <div style="font-size:8px;color:#1e40af;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;margin-top:3px;">Anthropic cost</div>
        </div>
        <div style="flex:1;min-width:100px;background:#f0fdf4;border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:20px;font-weight:800;color:#166534;">$0.00</div>
          <div style="font-size:8px;color:#166534;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;margin-top:3px;">Groq cost (free)</div>
        </div>
        <div style="flex:1;min-width:100px;background:#fefce8;border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:20px;font-weight:800;color:#854d0e;">${fmtCost(cost.cacheSavingsUsd)}</div>
          <div style="font-size:8px;color:#854d0e;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;margin-top:3px;">Cache saved</div>
        </div>
        <div style="flex:1;min-width:100px;background:#f5f3ff;border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:20px;font-weight:800;color:#4c1d95;">${cacheRate}%</div>
          <div style="font-size:8px;color:#4c1d95;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;margin-top:3px;">Cache hit rate</div>
        </div>
      </div>

      <!-- Summary line -->
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:11px;color:#374151;">
        <div style="display:flex;gap:20px;flex-wrap:wrap;">
          <div>Anthropic requests: <strong>${cost.anthropicRequests}</strong></div>
          <div>Groq requests: <strong>${cost.groqRequests}</strong></div>
          <div>Total requests: <strong>${cost.anthropicRequests + cost.groqRequests}</strong></div>
        </div>
      </div>

      <!-- Page breakdown table -->
      ${cost.byPage.length > 0 ? `
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr style="background:#f5f3ff;">
            <th style="padding:6px 10px;text-align:left;font-size:9px;color:#4c1d95;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Page</th>
            <th style="padding:6px 10px;text-align:center;font-size:9px;color:#4c1d95;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Provider</th>
            <th style="padding:6px 10px;text-align:center;font-size:9px;color:#4c1d95;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Requests</th>
            <th style="padding:6px 10px;text-align:right;font-size:9px;color:#4c1d95;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Cost</th>
          </tr>
        </thead>
        <tbody>${pageRows}</tbody>
      </table>` : ""}

    </div>
  </div>`;
}

function buildEmailHtml(summary: DailySummary, dateLabel: string, cost: DailyCostSummary): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f6f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:900px;margin:20px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0d1b14 0%,#1a3d2b 60%,#1a5c3f 100%);padding:24px 28px;">
    <div style="font-size:9px;letter-spacing:2.5px;text-transform:uppercase;color:#52b788;margin-bottom:5px;font-weight:600;">
      nextVillage · Site-Wide Daily Activity
    </div>
    <div style="font-size:20px;font-weight:800;color:#fff;margin-bottom:2px;">Daily Activity Report</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.5);">${dateLabel} · 12:00 Nigerian Time (WAT)</div>
    <div style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap;">
      <div style="background:rgba(255,255,255,0.12);border-radius:7px;padding:7px 12px;text-align:center;">
        <div style="font-size:18px;font-weight:700;color:#fff;">${summary.signedInToday}</div>
        <div style="font-size:8px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.8px;">Signed In Today</div>
      </div>
      <div style="background:rgba(82,183,136,0.2);border-radius:7px;padding:7px 12px;text-align:center;">
        <div style="font-size:18px;font-weight:700;color:#52b788;">${summary.activeToday}</div>
        <div style="font-size:8px;color:#52b788;text-transform:uppercase;letter-spacing:0.8px;">Active Today (login + usage)</div>
      </div>
      <div style="background:rgba(255,255,255,0.08);border-radius:7px;padding:7px 12px;text-align:center;">
        <div style="font-size:18px;font-weight:700;color:rgba(255,255,255,0.7);">${summary.totalRegisteredUsers}</div>
        <div style="font-size:8px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.8px;">Total Registered Users</div>
      </div>
    </div>
  </div>

  <div style="padding:20px 24px;">

    <!-- Per-user table -->
    <div style="margin-bottom:20px;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#eef3ef;padding:10px 16px;font-size:11px;font-weight:700;color:#1a5c3f;text-transform:uppercase;letter-spacing:0.6px;">
        Who Signed In Today
      </div>
      <div style="overflow-x:auto;">
        ${buildUserTable(summary.rows)}
      </div>
    </div>

    ${buildCostSection(cost)}

    <!-- Footer -->
    <div style="border-top:1px solid #e5e7eb;padding-top:12px;color:#9ca3af;font-size:10px;">
      <div>🕛 Generated at 12:00 WAT (11:00 UTC) ·
        <a href="https://www.nextvillage.community" style="color:#1a5c3f;text-decoration:none;">Open App ↗</a>
      </div>
      <div style="margin-top:3px;">Facilitator/admin accounts excluded. Site-wide — no cohort or organization filter. "Pages Used Today" lists every dashboard category_activity plus AI Playground / Systems Think / Agriculture Consultation activity logged today; "no logged activity" means the user signed in but touched nothing yet.</div>
    </div>
  </div>
</div>
</body></html>`;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron    = req.headers["authorization"] === `Bearer ${cronSecret}`;
  const isManualTrigger = req.headers["x-cron-secret"] === cronSecret && !!cronSecret;
  if (!isVercelCron && !isManualTrigger) return res.status(401).json({ error: "Unauthorized" });

  const logDate = (req.query.date as string) || todayWAT();
  const dateLabel = new Date(logDate).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  console.log(`\n${"─".repeat(50)}\nDAILY REPORT — ${dateLabel}\n${"─".repeat(50)}`);

  try {
    const costStartUTC = new Date(`${logDate}T00:00:00Z`).toISOString();
    const costEndUTC   = new Date(`${logDate}T23:59:59Z`).toISOString();

    const [loginMap, costSummary] = await Promise.all([
      fetchAllAuthUsers(),
      fetchDailyCosts(costStartUTC, costEndUTC),
    ]);
    console.log(`  Auth users with login history: ${loginMap.size}`);

    const summary = await fetchDailySummary(logDate, loginMap);
    console.log(`  Signed in today: ${summary.signedInToday} · Active today: ${summary.activeToday} · Total registered: ${summary.totalRegisteredUsers}`);
    console.log(`  [Cost] Anthropic: $${costSummary.anthropicCostUsd.toFixed(4)} · Groq: ${costSummary.groqRequests} reqs · Cache saved: $${costSummary.cacheSavingsUsd.toFixed(4)} · Available: ${costSummary.available}`);

    // ── Upsert one summary row per day into daily_activity_log ──────────────
    let upsertError: string | null = null;
    try {
      const catAiLearning        = summary.categoryTotals["AI Learning"] || 0;
      const catSkillsDevelopment = summary.categoryTotals["Skills Development"] || 0;
      const catFoundations       = (summary.categoryTotals["english_skills"] || 0) + (summary.categoryTotals["math_skills"] || 0) + (summary.categoryTotals["science_skills"] || 0);
      const catCommunityImpact   = summary.categoryTotals["Community Impact"] || 0;
      const catMediaGeneration   = (summary.categoryTotals["Image Generation"] || 0) + (summary.categoryTotals["Video Generation"] || 0) + (summary.categoryTotals["Voice Generation"] || 0);
      const catSpecializedTracks = (summary.categoryTotals["Financial Literacy"] || 0) + (summary.categoryTotals["Solar Engineering & Installation"] || 0);
      const catAiProficiencyCert = summary.categoryTotals["Certification"] || 0;
      const totalActivities      = Object.values(summary.categoryTotals).reduce((s, n) => s + n, 0);
      const catOther = Math.max(0, totalActivities - catAiLearning - catSkillsDevelopment - catFoundations - catCommunityImpact - catMediaGeneration - catSpecializedTracks - catAiProficiencyCert);

      const upsertRow = {
        log_date:                summary.logDate,
        city:                    "All",
        logged_at:               new Date().toISOString(),
        active_users:            summary.activeToday,
        signed_in_today:         summary.signedInToday,
        cat_ai_learning:         catAiLearning,
        cat_skills_development:  catSkillsDevelopment,
        cat_foundations:         catFoundations,
        cat_community_impact:    catCommunityImpact,
        cat_media_generation:    catMediaGeneration,
        cat_specialized_tracks:  catSpecializedTracks,
        cat_ai_proficiency_cert: catAiProficiencyCert,
        cat_other:               catOther,
        playground_users:        0,
        playground_chats_total:  0,
        cert_attempted_users:    0,
        cert_attempted_today:    0,
        total_activities:        totalActivities,
        total_africa_users:      summary.totalRegisteredUsers,
        cost_anthropic_usd:      costSummary.available ? costSummary.anthropicCostUsd : null,
        cost_groq_requests:      costSummary.available ? costSummary.groqRequests : null,
        cost_cache_savings_usd:  costSummary.available ? costSummary.cacheSavingsUsd : null,
        cost_cache_hit_rate_pct: costSummary.available && costSummary.totalInputTokens > 0
          ? Math.round(costSummary.cacheHitTokens / costSummary.totalInputTokens * 100) : null,
        cost_total_requests:     costSummary.available ? (costSummary.anthropicRequests + costSummary.groqRequests) : null,
      };
      const { error } = await supabase.from("daily_activity_log").upsert([upsertRow], { onConflict: "log_date,city" });
      if (error) { upsertError = error.message; console.error("❌ Upsert error:", error.message); }
      else console.log(`✅ daily_activity_log upserted for ${logDate}`);
    } catch (e: any) {
      upsertError = e.message;
      console.error("❌ Upsert threw:", e.message);
    }

    // ── Email ────────────────────────────────────────────────────────────────
    let emailError: string | null = null;
    try {
      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) {
        emailError = "RESEND_API_KEY not set";
        console.warn("⚠️  RESEND_API_KEY not set — skipping email");
      } else {
        const html = buildEmailHtml(summary, dateLabel, costSummary);
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "nextVillage <reports@nextvillage.community>",
            to: ["khallinan1@udayton.edu"],
            subject: `📅 Daily Report — ${dateLabel} · ${summary.signedInToday} signed in`,
            html,
          }),
        });
        if (!emailRes.ok) {
          emailError = `Resend ${emailRes.status}: ${await emailRes.text()}`;
          console.error("❌ Resend error:", emailError);
        } else {
          console.log("✉️  Daily report emailed");
        }
      }
    } catch (e: any) {
      emailError = e.message;
      console.error("❌ Email threw:", e.message);
    }

    return res.status(200).json({
      date: logDate,
      signedInToday: summary.signedInToday,
      activeToday: summary.activeToday,
      totalRegisteredUsers: summary.totalRegisteredUsers,
      rows: summary.rows.length,
      upsertOk: upsertError === null,
      upsertError,
      emailOk: emailError === null,
      emailError,
    });
  } catch (err: any) {
    console.error("❌ Fatal:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
