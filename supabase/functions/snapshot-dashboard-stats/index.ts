// supabase/functions/snapshot-dashboard-stats/index.ts
// Runs at 00:00:00 UTC daily via Supabase cron scheduler.
// Pulls from user_monthly_assessments + dashboard,
// applies k-anonymization, writes to dashboard_stats.
//
// Deploy: supabase functions deploy snapshot-dashboard-stats
// Schedule: supabase scheduler create --cron "0 0 * * *" --function snapshot-dashboard-stats

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const K_ANON_MIN = 5;    // Minimum cohort size for k-anonymization
const K_ANON_SALT = Deno.env.get("K_ANON_SALT") ?? "vai-research-salt-2025";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function logEvent(payload: {
  event_type: string;
  severity: 'warning' | 'error' | 'critical';
  details: Record<string, unknown>;
}) {
  try {
    await supabase.from('system_events').insert({
      function_name: 'snapshot-dashboard-stats',
      event_type:    payload.event_type,
      severity:      payload.severity,
      payload:       payload.details,
      created_at:    new Date().toISOString(),
    });
  } catch { /* never block snapshot for logging */ }
}

// Stable, non-reversible learner token
function learnerToken(userId: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(userId + K_ANON_SALT);
  // Simple hash — in production use crypto.subtle.digest for SHA-256
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data[i];
    hash |= 0;
  }
  // Return as hex-like string, padded to look like a token
  return Math.abs(hash).toString(16).padStart(8, "0") +
    userId.replace(/-/g, "").slice(0, 24);
}

function gradeBand(gradeLevel: number | null): string | null {
  if (!gradeLevel) return null;
  if (gradeLevel <= 4)  return "1-4";
  if (gradeLevel <= 8)  return "5-8";
  return "9-12";
}

function truncateToMonth(date: string): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

Deno.serve(async (req) => {
  try {
    const snapshotDate = new Date().toISOString().split("T")[0];
    console.log(`[snapshot] Starting snapshot for ${snapshotDate}`);

    // ── 1. Fetch all monthly assessments ─────────────────────────────────────
    const { data: assessments, error: asmErr } = await supabase
      .from("user_monthly_assessments")
      .select(`
        user_id, measured_at,
        cognitive_score, critical_thinking_score, problem_solving_score, creativity_score,
        pue_score, pue_energy_constraint_pct, pue_market_pricing_pct,
        pue_enterprise_planning_pct, pue_learner_initiated_pct,
        pue_multi_domain_pct, pue_local_context_pct,
        session_count, engaged_session_count, avg_words_per_session,
        scaffold_convergence_trend, scaffold_clarification_per_session,
        scaffold_decomposition_per_session, scaffold_consecutive_correction_runs,
        reasoning_level_0, reasoning_level_1, reasoning_level_2, reasoning_level_3,
        reasoning_chain_count,
        metacog_verification_rate, metacog_reactive_rate, metacog_strategic_rate,
        role_readiness_signal, role_teaching_intent_count,
        role_community_application_count, role_enterprise_orientation_count,
        role_intergenerational_count, peer_diffusion_signal,
        cert_attempted_count, cert_passed_count, cert_avg_score, cert_names_passed,
        ci_tracks_active_count, ci_certs_passed_count,
        ai_prof_application_score, ai_prof_ethics_score,
        ai_prof_understanding_score, ai_prof_verification_score,
        ai_prof_min_score, ai_prof_cert_level
      `);

    if (asmErr) throw new Error(`Assessment fetch error: ${asmErr.message}`);
    console.log(`[snapshot] Fetched ${assessments?.length ?? 0} assessment rows`);

    // assess-monthly has occasionally run twice for the same user in the same
    // month (backfills, manual re-runs) — dashboard_stats has one row per
    // (learner, cohort_month), so keep only the most recent measured_at per
    // (user_id, month) before building rows, or the insert below collides
    // with itself on the unique constraint.
    const latestByUserMonth = new Map<string, typeof assessments[number]>();
    for (const a of assessments ?? []) {
      const key = `${a.user_id}::${truncateToMonth(a.measured_at)}`;
      const existing = latestByUserMonth.get(key);
      if (!existing || a.measured_at > existing.measured_at) {
        latestByUserMonth.set(key, a);
      }
    }
    const dedupedAssessments = [...latestByUserMonth.values()];
    console.log(`[snapshot] Deduped to ${dedupedAssessments.length} (user, month) rows`);

    // ── 2. Fetch dashboard activity summary per user ──────────────────────────
    // PostgREST caps unranged selects at ~1000 rows — dashboard has 30,000+,
    // so this must be paginated or almost every user's activity/cert counts
    // silently come back as whatever fell in the first page (effectively 0
    // for most learners).
    const dashActivities: {
      user_id: string; category_activity: string | null; progress: string | null;
      certificate_pdf_url: string | null; continent: string | null;
      country: string | null; grade_level: number | null;
    }[] = [];
    {
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data: page, error: dashErr } = await supabase
          .from("dashboard")
          .select(`
            user_id, category_activity, progress, certificate_pdf_url,
            continent, country, grade_level
          `)
          .range(from, from + PAGE - 1);
        if (dashErr) throw new Error(`Dashboard fetch error: ${dashErr.message}`);
        dashActivities.push(...(page ?? []));
        if (!page || page.length < PAGE) break;
        from += PAGE;
      }
      console.log(`[snapshot] Fetched ${dashActivities.length} dashboard rows`);
    }

    // Build per-user dashboard summary
    const dashMap: Record<string, {
      activities_started: number;
      activities_completed: number;
      categories_active: Set<string>;
      certifications_earned: number;
      site: string;
      grade_level: number | null;
    }> = {};

    for (const row of dashActivities ?? []) {
      if (!dashMap[row.user_id]) {
        dashMap[row.user_id] = {
          activities_started: 0,
          activities_completed: 0,
          categories_active: new Set(),
          certifications_earned: 0,
          site: row.country ?? row.continent ?? "Unknown",
          grade_level: row.grade_level ?? null,
        };
      }
      const d = dashMap[row.user_id];
      d.activities_started++;
      if (row.progress === "completed") d.activities_completed++;
      if (row.category_activity) d.categories_active.add(row.category_activity);
      // A cert is "earned" once its assessments clear the passing threshold
      // (progress === 'completed'), not once a PDF happens to be downloaded —
      // learners routinely complete a certification without ever clicking
      // "Download Certificate", which was silently undercounting this stat.
      if (row.category_activity === "Certification" && row.progress === "completed") {
        d.certifications_earned++;
      }
    }

    // ── 3. Fetch profiles for site (country/city) mapping ────────────────────
    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select("id, country, city, grade_level");

    if (profErr) throw new Error(`Profile fetch error: ${profErr.message}`);

    const profileMap: Record<string, { site: string; grade_level: number | null }> = {};
    for (const p of profiles ?? []) {
      profileMap[p.id] = {
        site: p.city ?? p.country ?? "Unknown",
        grade_level: p.grade_level ?? null,
      };
    }

    // ── 4. Build snapshot rows ────────────────────────────────────────────────
    const rows = dedupedAssessments.map((a) => {
      const profile = profileMap[a.user_id] ?? { site: "Unknown", grade_level: null };
      const dash = dashMap[a.user_id];
      const cohortMonth = truncateToMonth(a.measured_at);

      return {
        snapshot_date:                     snapshotDate,
        activity_date:                     cohortMonth,
        site:                              profile.site,
        cohort_month:                      cohortMonth,
        learner_token:                     learnerToken(a.user_id),
        grade_band:                        gradeBand(profile.grade_level),
        session_count:                     a.session_count,
        engaged_session_count:             a.engaged_session_count,
        avg_words_per_session:             a.avg_words_per_session,
        ai_prof_application_score:         a.ai_prof_application_score,
        ai_prof_ethics_score:              a.ai_prof_ethics_score,
        ai_prof_understanding_score:       a.ai_prof_understanding_score,
        ai_prof_verification_score:        a.ai_prof_verification_score,
        ai_prof_min_score:                 a.ai_prof_min_score,
        ai_prof_cert_level:                a.ai_prof_cert_level,
        cognitive_score:                   a.cognitive_score,
        critical_thinking_score:           a.critical_thinking_score,
        problem_solving_score:             a.problem_solving_score,
        creativity_score:                  a.creativity_score,
        scaffold_convergence_trend:        a.scaffold_convergence_trend,
        scaffold_clarification_per_session:      a.scaffold_clarification_per_session,
        scaffold_decomposition_per_session:      a.scaffold_decomposition_per_session,
        scaffold_consecutive_correction_runs:    a.scaffold_consecutive_correction_runs,
        reasoning_level_0:                 a.reasoning_level_0,
        reasoning_level_1:                 a.reasoning_level_1,
        reasoning_level_2:                 a.reasoning_level_2,
        reasoning_level_3:                 a.reasoning_level_3,
        reasoning_chain_count:             a.reasoning_chain_count,
        metacog_verification_rate:         a.metacog_verification_rate,
        metacog_reactive_rate:             a.metacog_reactive_rate,
        metacog_strategic_rate:            a.metacog_strategic_rate,
        pue_score:                         a.pue_score,
        pue_energy_constraint_pct:         a.pue_energy_constraint_pct,
        pue_market_pricing_pct:            a.pue_market_pricing_pct,
        pue_enterprise_planning_pct:       a.pue_enterprise_planning_pct,
        pue_learner_initiated_pct:         a.pue_learner_initiated_pct,
        pue_multi_domain_pct:              a.pue_multi_domain_pct,
        pue_local_context_pct:             a.pue_local_context_pct,
        role_readiness_signal:             a.role_readiness_signal,
        role_teaching_intent_count:        a.role_teaching_intent_count,
        role_community_application_count:  a.role_community_application_count,
        role_enterprise_orientation_count: a.role_enterprise_orientation_count,
        role_intergenerational_count:      a.role_intergenerational_count,
        peer_diffusion_signal:             a.peer_diffusion_signal,
        cert_attempted_count:              a.cert_attempted_count,
        cert_passed_count:                 a.cert_passed_count,
        cert_avg_score:                    a.cert_avg_score,
        cert_names_passed:                 a.cert_names_passed,
        activities_started_total:          dash?.activities_started ?? 0,
        activities_completed_total:        dash?.activities_completed ?? 0,
        categories_ever_active:            dash ? Array.from(dash.categories_active) : [],
        certifications_earned_total:       dash?.certifications_earned ?? 0,
        ci_tracks_active_count:            a.ci_tracks_active_count,
        ci_certs_passed_count:             a.ci_certs_passed_count,
        k_anon_suppressed:                 false,
      };
    });

    // ── 5. K-anonymization: suppress cohorts < K_ANON_MIN ─────────────────────
    // Count learners per site+month
    const cohortCounts: Record<string, number> = {};
    for (const row of rows) {
      const key = `${row.site}::${row.cohort_month}`;
      cohortCounts[key] = (cohortCounts[key] ?? 0) + 1;
    }

    // Mark suppressed rows
    const finalRows = rows.map((row) => {
      const key = `${row.site}::${row.cohort_month}`;
      if ((cohortCounts[key] ?? 0) < K_ANON_MIN) {
        return { ...row, k_anon_suppressed: true };
      }
      return row;
    });

    const suppressed = finalRows.filter(r => r.k_anon_suppressed).length;
    const active = finalRows.filter(r => !r.k_anon_suppressed).length;
    console.log(`[snapshot] ${active} rows active, ${suppressed} suppressed (k<${K_ANON_MIN})`);

    // ── 6. Rebuild dashboard_stats from scratch each run ───────────────────────
    // Every run recomputes the full set of rows from user_monthly_assessments,
    // not just "today's" activity, and activity_date is keyed per cohort_month
    // rather than per run — so a row left over from a previous run's
    // cohort_month would collide with today's row on the
    // (activity_date, learner_token, site) unique constraint. Clearing the
    // whole table first keeps this idempotent no matter how long it's been
    // since the last successful run. User confirmed this is safe: the source
    // data (user_monthly_assessments) is intact and this fully regenerates it.
    await supabase
      .from("dashboard_stats")
      .delete()
      .not("id", "is", null);

    const BATCH_SIZE = 100;
    let inserted = 0;
    for (let i = 0; i < finalRows.length; i += BATCH_SIZE) {
      const batch = finalRows.slice(i, i + BATCH_SIZE);
      const { error: insertErr } = await supabase
        .from("dashboard_stats")
        .insert(batch);
      if (insertErr) throw new Error(`Insert error at batch ${i}: ${insertErr.message}`);
      inserted += batch.length;
    }

    console.log(`[snapshot] Complete. ${inserted} rows written for ${snapshotDate}`);

    return new Response(JSON.stringify({
      success: true,
      snapshot_date: snapshotDate,
      rows_written: inserted,
      rows_suppressed: suppressed,
    }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[snapshot] Error:", err);
    await logEvent({
      event_type: 'snapshot_failed',
      severity:   'error',
      details:    { error: err.message },
    });
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});