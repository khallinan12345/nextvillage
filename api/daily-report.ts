/**
 * DAILY ACTIVITY REPORT — Vercel Cron Handler
 *
 * Runs every day at 11:00 UTC (12:00 Nigerian WAT / West Africa Time = UTC+1).
 * Vercel cron: "0 11 * * *"
 *
 * Reports on Africa-cohort users who were active today:
 *   • Total users who logged in today (auth.users.last_sign_in_at) — not
 *     dashboard activity, since a user who only used the AI Playground or
 *     just logged in without starting a learning activity was previously
 *     invisible to this count
 *   • Breakdown by category_activity
 *   • AI Playground users and chat counts
 *   • Certification attempt counts (all-time + today)
 *
 * Sends email to khallinan1@udayton.edu and bennywhite.davidson@renewvia.com
 * Writes a row to public.daily_activity_log in Supabase.
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

// ─── Organization IDs (matches assess-monthly.ts) ─────────────────────────────
const VAI_ORG_ID       = 'c0b48eae-67af-449d-8c04-cc6950bf0982'; // 100 Black Girls / vAI
const SOLARDERO_ORG_ID = 'a1b2c3d4-0002-0002-0002-000000000002'; // Solardero / Ibiade
const OLOIBIRI_ORG_ID  = 'a1b2c3d4-0001-0001-0001-000000000001'; // Davidson AI Futures Lab / Oloibiri

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyMetrics {
  logDate: string;
  city: string;
  totalAfricaUsers: number;
  activeUsers: number;
  totalActivities: number;
  catAiLearning: number;
  catSkillsDevelopment: number;
  catEnglishSkills: number;
  catAiProficiencyCert: number;
  catOther: number;
  playgroundUsers: number;
  playgroundChatsTotal: number;
  certAttemptedUsers: number;
  certAttemptedToday: number;
}

interface UserProfile {
  id: string;
  name: string | null;
  city: string | null;
  organization_id: string | null;
  continent: string | null;
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

// ─── Profile Fetching (aligned with assess-monthly.ts) ────────────────────────
// Single source of truth for fetching all Africa-cohort profiles.
// Uses the SAME.or() filter as assess-monthly.ts to ensure identical coverage.

async function fetchAllCohortProfiles(): Promise<UserProfile[]> {
  const { data: profiles } = await supabase.from("profiles").select("id, name, city, organization_id, continent").or(`continent.eq.Africa,organization_id.eq.${VAI_ORG_ID},organization_id.eq.${SOLARDERO_ORG_ID},organization_id.eq.${OLOIBIRI_ORG_ID}`);

  return (profiles || []).filter((p) => !EXCLUDED_USER_IDS.has(p.id));
}

// Split profiles into Oloibiri vs Ibiade cohorts.
// Logic: Ibiade = explicitly city='Ibiade' OR organization_id=SOLARDERO_ORG_ID.
// Oloibiri = everyone else in the Africa cohort.
//
// IMPORTANT: A user can only be in ONE cohort. If a user matches both
// (e.g. Solardero org but city='Oloibiri'), Ibiade takes priority since
// org_id is more reliable than free-text city field.

function splitCohorts(profiles: UserProfile[]): {
  oloibiriProfiles: UserProfile[];
  ibiadeProfiles: UserProfile[];
} {
  const ibiadeProfiles: UserProfile[] = [];
  const oloibiriProfiles: UserProfile[] = [];

  const ibiadeIds = new Set<string>();

  for (const p of profiles) {
    const isIbiade =
      p.organization_id === SOLARDERO_ORG_ID ||
      (p.city || "").toLowerCase().trim() === "ibiade";

    if (isIbiade) {
      ibiadeProfiles.push(p);
      ibiadeIds.add(p.id);
    }
  }

  // Oloibiri = everyone NOT in Ibiade
  for (const p of profiles) {
    if (!ibiadeIds.has(p.id)) {
      oloibiriProfiles.push(p);
    }
  }

  return { oloibiriProfiles, ibiadeProfiles };
}

// ─── Auth Login Fetching ───────────────────────────────────────────────────────
// profiles.updated_at is NOT a login signal in this app — it only changes when
// a user edits their name/settings, which is rare. auth.users.last_sign_in_at
// is maintained by Supabase Auth itself on every sign-in, independent of app
// code, so it's the accurate source for "who showed up today." Paginated in
// case the user base grows past what a single page returns.

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

async function fetchMetrics(logDate: string, cohortIds: string[], city: string, loginMap: Map<string, string | null>): Promise<DailyMetrics> {
  const dayStartUTC = new Date(`${logDate}T00:00:00+01:00`).toISOString();
  const dayEndUTC   = new Date(`${logDate}T23:59:59+01:00`).toISOString();

  const totalAfricaUsers = cohortIds.length;

  if (!cohortIds.length) {
    return {
      logDate, city, totalAfricaUsers: 0,
      activeUsers: 0, totalActivities: 0,
      catAiLearning: 0, catSkillsDevelopment: 0, catEnglishSkills: 0,
      catAiProficiencyCert: 0, catOther: 0,
      playgroundUsers: 0, playgroundChatsTotal: 0,
      certAttemptedUsers: 0, certAttemptedToday: 0,
    };
  }

  // ── Dashboard sessions started OR updated on this day ────────────────
  const [createdRows, updatedRows] = await Promise.all([
    inChunks(cohortIds, async (chunk) => {
      const { data } = await supabase.from("dashboard").select("id, user_id, category_activity, activity").in("user_id", chunk).gte("created_at", dayStartUTC).lte("created_at", dayEndUTC);
      return data || [];
    }),
    inChunks(cohortIds, async (chunk) => {
      const { data } = await supabase.from("dashboard").select("id, user_id, category_activity, activity").in("user_id", chunk).gte("updated_at", dayStartUTC).lte("updated_at", dayEndUTC);
      return data || [];
    }),
  ]);

  const sessionMap = new Map<string, { id: string; user_id: string; category_activity: string; activity: string }>();
  for (const row of [...createdRows,...updatedRows]) {
    sessionMap.set(row.id, row);
  }
  const sessionRows = [...sessionMap.values()];
  const totalActivities = sessionRows.length;

  // "Active" = logged in today, not "touched the dashboard table today" —
  // see fetchAllAuthUsers for why. totalActivities/category breakdown below
  // stay dashboard-based; that's legitimately about which activities ran,
  // not about who counts as active.
  const activeUserSet = new Set(
    cohortIds.filter((id) => {
      const lastSignIn = loginMap.get(id);
      return !!lastSignIn && lastSignIn >= dayStartUTC && lastSignIn <= dayEndUTC;
    })
  );
  const activeUsers = activeUserSet.size;

  // ── Category breakdown ────────────────────────────────────────────────
  const catCounts: Record<string, number> = {
    aiLearning: 0, skillsDevelopment: 0,
    englishSkills: 0, aiProficiencyCert: 0, other: 0,
  };
  for (const row of sessionRows) {
    const cat = (row.category_activity || "").toLowerCase();
    const act = (row.activity || "").toLowerCase();
    if (cat.includes("ai learning") || (cat.includes("ai proficiency") && !act.includes("certification"))) {
      catCounts.aiLearning++;
    } else if (cat.includes("skills development") || cat.includes("vibe")) {
      catCounts.skillsDevelopment++;
    } else if (act.includes("english_skills") || cat.includes("english")) {
      catCounts.englishSkills++;
    } else if (act.includes("ai proficiency certification") || cat.includes("certification")) {
      catCounts.aiProficiencyCert++;
    } else {
      catCounts.other++;
    }
  }

  // ── AI Playground ─────────────────────────────────────────────────────
  const [pgCreated, pgUpdated] = await Promise.all([
    inChunks(cohortIds, async (chunk) => {
      const { data } = await supabase.from("ai_playground_chats").select("id, user_id").in("user_id", chunk).gte("created_at", dayStartUTC).lte("created_at", dayEndUTC);
      return data || [];
    }),
    inChunks(cohortIds, async (chunk) => {
      const { data } = await supabase.from("ai_playground_chats").select("id, user_id").in("user_id", chunk).gte("updated_at", dayStartUTC).lte("updated_at", dayEndUTC);
      return data || [];
    }),
  ]);
  const pgMap = new Map<string, string>();
  for (const row of [...pgCreated,...pgUpdated]) pgMap.set(row.id, row.user_id);
  const pgRowsToday = [...pgMap.entries()].map(([id, user_id]) => ({ id, user_id }));
  const playgroundUsers = new Set(pgRowsToday.map((r) => r.user_id)).size;
  const playgroundChatsTotal = pgRowsToday.length;

  // ── Certifications ─────────────────────────────────────────────────────
  const certAllTime = await inChunks(cohortIds, async (chunk) => {
    const { data } = await supabase.from("dashboard").select("user_id, created_at, updated_at").in("user_id", chunk).eq("activity", "AI Proficiency Certification").not("certification_evaluation_score", "is", null);
    return data || [];
  });
  const certAttemptedUsers = new Set(certAllTime.map((r) => r.user_id)).size;
  const certAttemptedToday = new Set(
    certAllTime.filter((r) =>
        (r.created_at >= dayStartUTC && r.created_at <= dayEndUTC) ||
        (r.updated_at >= dayStartUTC && r.updated_at <= dayEndUTC)
      ).map((r) => r.user_id)
  ).size;

  return {
    logDate, city, totalAfricaUsers,
    activeUsers, totalActivities,
    catAiLearning:        catCounts.aiLearning,
    catSkillsDevelopment: catCounts.skillsDevelopment,
    catEnglishSkills:     catCounts.englishSkills,
    catAiProficiencyCert: catCounts.aiProficiencyCert,
    catOther:             catCounts.other,
    playgroundUsers, playgroundChatsTotal,
    certAttemptedUsers, certAttemptedToday,
  };
}

// ─── Cost Fetching ───────────────────────────────────────────────────────────

const PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6":         { input: 3.00,  output: 15.00 },
  "claude-haiku-4-5-20251001": { input: 1.00,  output: 5.00  },
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

function catRow(label: string, count: number, total: number): string {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const w = Math.min(pct * 1.2, 120);
  const active = count > 0;
  return `
  <tr style="border-top:1px solid #e5e7eb;">
    <td style="padding:6px 10px;font-size:11px;color:#374151;">${label}</td>
    <td style="padding:6px 10px;text-align:center;font-size:12px;font-weight:700;color:${active ? "#1a3d2b" : "#9ca3af"};">${count}</td>
    <td style="padding:6px 16px;">
      <span style="display:inline-block;background:#e5e7eb;border-radius:3px;width:120px;height:7px;vertical-align:middle;">
        <span style="display:inline-block;background:${active ? "#2d6a4f" : "#e5e7eb"};border-radius:3px;height:7px;width:${w}px;"></span>
      </span>
      <span style="font-size:10px;color:#6b7280;margin-left:6px;">${pct}%</span>
    </td>
  </tr>`;
}

function buildCohortPanel(m: DailyMetrics): string {
  const participationPct = m.totalAfricaUsers > 0
    ? Math.round((m.activeUsers / m.totalAfricaUsers) * 100)
    : 0;
  const isIbiade = m.city === "Ibiade";
  const accentBg    = isIbiade ? "#dbeafe" : "#dcfce7";
  const accentColor = isIbiade ? "#1e3a8a" : "#166534";
  const headerBg    = isIbiade
    ? "linear-gradient(135deg,#1a3d5c 0%,#1d6a8f 100%)"
    : "linear-gradient(135deg,#1a3d2b 0%,#2d6a4f 100%)";
  const subtitleColor = isIbiade ? "#52b0d0" : "#52b788";
  const institution   = isIbiade
    ? "Solardero Foundation · Ibiade, Ogun State"
    : "Davidson AI Innovation Center · Oloibiri, Bayelsa";

  return `
  <div style="margin-bottom:24px;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:${headerBg};padding:16px 20px;">
      <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${subtitleColor};margin-bottom:4px;font-weight:600;">${institution}</div>
      <div style="font-size:16px;font-weight:700;color:#fff;">${m.city} Cohort</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.5);">${m.totalAfricaUsers} total learners</div>
    </div>
    <div style="padding:16px 20px;">
      <!-- Chips -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
        <div style="flex:1;min-width:90px;background:${accentBg};border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:20px;font-weight:800;color:${accentColor};">${m.activeUsers}</div>
          <div style="font-size:8px;color:${accentColor};font-weight:600;text-transform:uppercase;letter-spacing:0.9px;margin-top:3px;">Active Today</div>
        </div>
        <div style="flex:1;min-width:90px;background:#dbeafe;border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:20px;font-weight:800;color:#1e40af;">${participationPct}%</div>
          <div style="font-size:8px;color:#1e40af;font-weight:600;text-transform:uppercase;letter-spacing:0.9px;margin-top:3px;">Participation</div>
        </div>
        <div style="flex:1;min-width:90px;background:#fef3c7;border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:20px;font-weight:800;color:#92400e;">${m.playgroundUsers}</div>
          <div style="font-size:8px;color:#92400e;font-weight:600;text-transform:uppercase;letter-spacing:0.9px;margin-top:3px;">Playground</div>
        </div>
        <div style="flex:1;min-width:90px;background:#f3e8ff;border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:20px;font-weight:800;color:#6b21a8;">${m.certAttemptedUsers}</div>
          <div style="font-size:8px;color:#6b21a8;font-weight:600;text-transform:uppercase;letter-spacing:0.9px;margin-top:3px;">Cert Attempted</div>
        </div>
      </div>
      <!-- Session overview -->
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:11px;color:#374151;">
        <div style="display:flex;gap:20px;flex-wrap:wrap;">
          <div>Unique active users: <strong>${m.activeUsers}</strong></div>
          <div>Total activity rows: <strong>${m.totalActivities}</strong></div>
          <div>Avg/user: <strong>${m.activeUsers > 0 ? (m.totalActivities / m.activeUsers).toFixed(1) : "—"}</strong></div>
        </div>
      </div>
      <!-- Category table -->
      <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:12px;">
        <thead>
          <tr style="background:#f5faf6;">
            <th style="padding:6px 10px;text-align:left;font-size:9px;color:#5a7060;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Category</th>
            <th style="padding:6px 10px;text-align:center;font-size:9px;color:#5a7060;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Sessions</th>
            <th style="padding:6px 16px;text-align:left;font-size:9px;color:#5a7060;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Share</th>
          </tr>
        </thead>
        <tbody>
          ${catRow("🤖 AI Learning",         m.catAiLearning,        m.totalActivities)}
          ${catRow("⚡ Skills Development",   m.catSkillsDevelopment, m.totalActivities)}
          ${catRow("🌍 English Skills",       m.catEnglishSkills,     m.totalActivities)}
          ${catRow("🏆 AI Proficiency Cert",  m.catAiProficiencyCert, m.totalActivities)}
          ${m.catOther > 0 ? catRow("📁 Other", m.catOther, m.totalActivities) : ""}
        </tbody>
      </table>
      <!-- Playground + cert row -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <div style="flex:1;background:#fffdf0;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;">
          <div style="font-size:10px;font-weight:600;color:#92400e;margin-bottom:4px;">🎮 Playground</div>
          <div style="font-size:11px;color:#374151;">Users: <strong>${m.playgroundUsers}</strong>   Chats: <strong>${m.playgroundChatsTotal}</strong></div>
        </div>
        <div style="flex:1;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:10px 12px;">
          <div style="font-size:10px;font-weight:600;color:#4c1d95;margin-bottom:4px;">🏆 Certifications</div>
          <div style="font-size:11px;color:#374151;">Ever attempted: <strong>${m.certAttemptedUsers}</strong>   Today: <strong>${m.certAttemptedToday}</strong></div>
        </div>
      </div>
    </div>
  </div>`;
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

function buildEmailHtml(oloibiri: DailyMetrics, ibiade: DailyMetrics, dateLabel: string, cost: DailyCostSummary): string {
  const totalActive = oloibiri.activeUsers + ibiade.activeUsers;
  const totalLearners = oloibiri.totalAfricaUsers + ibiade.totalAfricaUsers;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f2f8f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:700px;margin:20px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0d1b14 0%,#1a3d2b 60%,#1a3d5c 100%);padding:24px 28px;">
    <div style="font-size:9px;letter-spacing:2.5px;text-transform:uppercase;color:#52b788;margin-bottom:5px;font-weight:600;">
      Girls AIing &amp; Vibing · Oloibiri (Davidson AI) &amp; Ibiade (Solardero)
    </div>
    <div style="font-size:20px;font-weight:800;color:#fff;margin-bottom:2px;">Daily Activity Report</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.5);">${dateLabel} · 12:00 Nigerian Time (WAT)</div>
    <div style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap;">
      <div style="background:rgba(255,255,255,0.12);border-radius:7px;padding:7px 12px;text-align:center;">
        <div style="font-size:18px;font-weight:700;color:#fff;">${totalActive}</div>
        <div style="font-size:8px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.8px;">Total Active</div>
      </div>
      <div style="background:rgba(82,183,136,0.2);border-radius:7px;padding:7px 12px;text-align:center;">
        <div style="font-size:18px;font-weight:700;color:#52b788;">${oloibiri.activeUsers}</div>
        <div style="font-size:8px;color:#52b788;text-transform:uppercase;letter-spacing:0.8px;">Oloibiri</div>
      </div>
      <div style="background:rgba(82,176,208,0.2);border-radius:7px;padding:7px 12px;text-align:center;">
        <div style="font-size:18px;font-weight:700;color:#52b0d0;">${ibiade.activeUsers}</div>
        <div style="font-size:8px;color:#52b0d0;text-transform:uppercase;letter-spacing:0.8px;">Ibiade</div>
      </div>
      <div style="background:rgba(255,255,255,0.08);border-radius:7px;padding:7px 12px;text-align:center;">
        <div style="font-size:18px;font-weight:700;color:rgba(255,255,255,0.7);">${totalLearners}</div>
        <div style="font-size:8px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.8px;">Total Cohort</div>
      </div>
    </div>
  </div>

  <div style="padding:20px 24px;">
    ${buildCohortPanel(oloibiri)}
    ${buildCohortPanel(ibiade)}

    ${buildCostSection(cost)}

    <!-- Footer -->
    <div style="border-top:1px solid #e5e7eb;padding-top:12px;color:#9ca3af;font-size:10px;">
      <div>🕛 Generated at 12:00 WAT (11:00 UTC)  ·  🌍 Oloibiri + Ibiade cohorts  · 
        <a href="https://girls-aiing-and-vibing.vercel.app" style="color:#2d6a4f;text-decoration:none;">Open App ↗</a>
      </div>
      <div style="margin-top:3px;">Facilitator accounts excluded. Active users and Playground users are distinct user counts per cohort. Cohorts derived from profiles.continent, organization_id (vAI + Solardero), and city field.</div>
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
    // ── Fetch ALL cohort profiles using the same filter as assess-monthly.ts ──
    const allProfiles = await fetchAllCohortProfiles();
    const { oloibiriProfiles, ibiadeProfiles } = splitCohorts(allProfiles);

    const oloibiriIds = oloibiriProfiles.map((p) => p.id);
    const ibiadeIds   = ibiadeProfiles.map((p) => p.id);

    console.log(`  Total cohort profiles: ${allProfiles.length}`);
    console.log(`  Oloibiri cohort: ${oloibiriIds.length} users`);
    console.log(`  Ibiade cohort:   ${ibiadeIds.length} users`);

    // Log any users that might have ambiguous assignment for debugging
    const bothOrgAndCity = allProfiles.filter(
      (p) => p.organization_id === SOLARDERO_ORG_ID && (p.city || "").toLowerCase().trim() !== "ibiade" && p.city
    );
    if (bothOrgAndCity.length > 0) {
      console.log(`  ⚠️  ${bothOrgAndCity.length} users have Solardero org but city≠Ibiade (assigned to Ibiade):`,
        bothOrgAndCity.map((p) => `${p.id.slice(0, 8)} city="${p.city}"`).join(", ")
      );
    }

    // ── Fetch metrics + cost data in parallel ────────────────────────────────
    const dayStartUTC = new Date(`${logDate}T00:00:00+01:00`).toISOString();
    const dayEndUTC   = new Date(`${logDate}T23:59:59+01:00`).toISOString();

    const costStartUTC = new Date(`${logDate}T00:00:00Z`).toISOString();
    const costEndUTC   = new Date(`${logDate}T23:59:59Z`).toISOString();
    console.log(`  Cost window: ${costStartUTC} → ${costEndUTC}`);

    const [loginMap, costSummary] = await Promise.all([
      fetchAllAuthUsers(),
      fetchDailyCosts(costStartUTC, costEndUTC),
    ]);
    console.log(`  Auth users with login history: ${loginMap.size}`);

    const [oloibiriMetrics, ibiadeMetrics] = await Promise.all([
      fetchMetrics(logDate, oloibiriIds, "Oloibiri", loginMap),
      fetchMetrics(logDate, ibiadeIds,   "Ibiade",   loginMap),
    ]);

    const logMetrics = (label: string, m: DailyMetrics) => {
      console.log(`  [${label}] Total: ${m.totalAfricaUsers} · Active: ${m.activeUsers} · Activities: ${m.totalActivities} · Playground: ${m.playgroundUsers} · Certs: ${m.certAttemptedUsers}`);
    };
    logMetrics("Oloibiri", oloibiriMetrics);
    logMetrics("Ibiade",   ibiadeMetrics);
    console.log(`  [Cost] Anthropic: $${costSummary.anthropicCostUsd.toFixed(4)} · Groq: ${costSummary.groqRequests} reqs · Cache saved: $${costSummary.cacheSavingsUsd.toFixed(4)} · Available: ${costSummary.available}`);

    // ── Upsert one row per cohort into daily_activity_log ───────────────────
    let upsertError: string | null = null;
    try {
      const upsertRows = [oloibiriMetrics, ibiadeMetrics].map((m) => ({
        log_date:                m.logDate,
        city:                    m.city,
        logged_at:               new Date().toISOString(),
        active_users:            m.activeUsers,
        cat_ai_learning:         m.catAiLearning,
        cat_skills_development:  m.catSkillsDevelopment,
        cat_english_skills:      m.catEnglishSkills,
        cat_ai_proficiency_cert: m.catAiProficiencyCert,
        cat_other:               m.catOther,
        playground_users:        m.playgroundUsers,
        playground_chats_total:  m.playgroundChatsTotal,
        cert_attempted_users:    m.certAttemptedUsers,
        cert_attempted_today:    m.certAttemptedToday,
        total_activities:        m.totalActivities,
        total_africa_users:      m.totalAfricaUsers,
        cost_anthropic_usd:      costSummary.available ? costSummary.anthropicCostUsd : null,
        cost_groq_requests:      costSummary.available ? costSummary.groqRequests : null,
        cost_cache_savings_usd:  costSummary.available ? costSummary.cacheSavingsUsd : null,
        cost_cache_hit_rate_pct: costSummary.available && costSummary.totalInputTokens > 0
          ? Math.round(costSummary.cacheHitTokens / costSummary.totalInputTokens * 100) : null,
        cost_total_requests:     costSummary.available ? (costSummary.anthropicRequests + costSummary.groqRequests) : null,
      }));
      const { error } = await supabase.from("daily_activity_log").upsert(upsertRows, { onConflict: "log_date,city" });
      if (error) { upsertError = error.message; console.error("❌ Upsert error:", error.message); }
      else console.log(`✅ daily_activity_log upserted for ${logDate} (Oloibiri + Ibiade)`);
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
        const html = buildEmailHtml(oloibiriMetrics, ibiadeMetrics, dateLabel, costSummary);
        const totalActive = oloibiriMetrics.activeUsers + ibiadeMetrics.activeUsers;
        const activeLabel = `${totalActive} active (${oloibiriMetrics.activeUsers} Oloibiri · ${ibiadeMetrics.activeUsers} Ibiade)`;
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Girls AIing & Vibing <reports@nextvillage.community>",
            to: ["khallinan1@udayton.edu"],
            subject: `📅 Daily Report — ${dateLabel} · ${activeLabel}`,
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
      totalCohort: allProfiles.length,
      oloibiri: {
        activeUsers: oloibiriMetrics.activeUsers,
        totalActivities: oloibiriMetrics.totalActivities,
        totalLearners: oloibiriMetrics.totalAfricaUsers,
      },
      ibiade: {
        activeUsers: ibiadeMetrics.activeUsers,
        totalActivities: ibiadeMetrics.totalActivities,
        totalLearners: ibiadeMetrics.totalAfricaUsers,
      },
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