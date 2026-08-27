-- The landing page's public-facing stats (dashboard_stats_public,
-- dashboard_stats_alltime, get_session_band_stats) never excluded rows
-- where k_anon_suppressed = true, unlike other dashboard_stats consumers
-- in this schema (get_research_snapshot, idx_ds_active, etc.). That meant
-- small cohorts (< K_ANON_MIN learners) meant to be suppressed for privacy
-- were still counted in the public totals. Add the same filter here.

CREATE OR REPLACE FUNCTION "public"."get_session_band_stats"() RETURNS TABLE("session_band" "text", "band_midpoint" integer, "n_learners" integer, "cognitive" numeric, "critical_thinking" numeric, "problem_solving" numeric, "creativity" numeric, "avg_clarification" numeric, "teaching_intent_pct" numeric, "community_application_pct" numeric, "enterprise_orientation_pct" numeric, "intergenerational_pct" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT
    session_band,
    band_midpoint,
    COUNT(DISTINCT learner_token)::integer,
    ROUND(AVG(NULLIF(cognitive_score,            0::numeric)), 1),
    ROUND(AVG(NULLIF(critical_thinking_score,    0::numeric)), 1),
    ROUND(AVG(NULLIF(problem_solving_score,      0::numeric)), 1),
    ROUND(AVG(NULLIF(creativity_score,           0::numeric)), 1),
    ROUND(AVG(NULLIF(scaffold_clarification_per_session, 0::numeric)), 2),
    ROUND(100.0 * SUM(CASE WHEN role_teaching_intent_count        > 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 1),
    ROUND(100.0 * SUM(CASE WHEN role_community_application_count  > 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 1),
    ROUND(100.0 * SUM(CASE WHEN role_enterprise_orientation_count > 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 1),
    ROUND(100.0 * SUM(CASE WHEN role_intergenerational_count      > 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 1)
  FROM (
    SELECT
      learner_token,
      cognitive_score, critical_thinking_score,
      problem_solving_score, creativity_score,
      scaffold_clarification_per_session,
      role_teaching_intent_count, role_community_application_count,
      role_enterprise_orientation_count, role_intergenerational_count,
      CASE
        WHEN cumulative_sessions <  50  THEN '1. Early'
        WHEN cumulative_sessions <  100 THEN '2. Developing'
        WHEN cumulative_sessions <  130 THEN '3. Established'
        WHEN cumulative_sessions >= 130 THEN '4. Core'
      END AS session_band,
      CASE
        WHEN cumulative_sessions <  50  THEN 25
        WHEN cumulative_sessions <  100 THEN 75
        WHEN cumulative_sessions <  130 THEN 115
        WHEN cumulative_sessions >= 130 THEN 160
      END AS band_midpoint
    FROM (
      SELECT *,
        SUM(session_count) OVER (
          PARTITION BY learner_token
          ORDER BY cohort_month
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )::integer AS cumulative_sessions
      FROM (
        SELECT DISTINCT ON (learner_token, cohort_month)
          learner_token, cohort_month, session_count,
          cognitive_score, critical_thinking_score,
          problem_solving_score, creativity_score,
          scaffold_clarification_per_session,
          role_teaching_intent_count, role_community_application_count,
          role_enterprise_orientation_count, role_intergenerational_count
        FROM dashboard_stats
        WHERE session_count >= 2
          AND k_anon_suppressed = false
        ORDER BY learner_token, cohort_month, snapshot_date DESC
      ) deduped
    ) with_cumulative
  ) bucketed
  WHERE session_band IS NOT NULL
  GROUP BY session_band, band_midpoint
  ORDER BY band_midpoint;
$$;


CREATE OR REPLACE VIEW "public"."dashboard_stats_alltime" AS
 WITH "deduped" AS (
         SELECT DISTINCT ON ("dashboard_stats"."learner_token", "dashboard_stats"."cohort_month") "dashboard_stats"."learner_token",
            "dashboard_stats"."cohort_month",
            "dashboard_stats"."session_count",
            "dashboard_stats"."certifications_earned_total"
           FROM "public"."dashboard_stats"
          WHERE "dashboard_stats"."k_anon_suppressed" = false
          ORDER BY "dashboard_stats"."learner_token", "dashboard_stats"."cohort_month", "dashboard_stats"."snapshot_date" DESC
        )
 SELECT "count"(DISTINCT "deduped"."learner_token") AS "total_learners",
    "sum"("deduped"."session_count") AS "total_sessions",
    ( SELECT COALESCE("sum"("lc"."max_certs"), (0)::bigint) AS "coalesce"
           FROM ( SELECT "deduped_1"."learner_token",
                    "max"("deduped_1"."certifications_earned_total") AS "max_certs"
                   FROM "deduped" "deduped_1"
                  GROUP BY "deduped_1"."learner_token") "lc") AS "total_certs",
    "count"(DISTINCT "deduped"."cohort_month") AS "months_of_data",
    "min"("deduped"."cohort_month") AS "first_month",
    "max"("deduped"."cohort_month") AS "latest_month"
   FROM "deduped";


CREATE OR REPLACE VIEW "public"."dashboard_stats_public" AS
 WITH "deduped" AS (
         SELECT DISTINCT ON ("ds"."learner_token", "ds"."cohort_month") "ds"."id",
            "ds"."snapshot_date",
            "ds"."activity_date",
            "ds"."cohort_month",
            "ds"."site",
            "ds"."learner_token",
            "ds"."grade_band",
            "ds"."activities_started_today",
            "ds"."activities_completed_today",
            "ds"."categories_active_today",
            "ds"."certifications_earned_today",
            "ds"."activities_started_total",
            "ds"."activities_completed_total",
            "ds"."certifications_earned_total",
            "ds"."categories_ever_active",
            "ds"."session_count",
            "ds"."engaged_session_count",
            "ds"."avg_words_per_session",
            "ds"."ai_prof_application_score",
            "ds"."ai_prof_ethics_score",
            "ds"."ai_prof_understanding_score",
            "ds"."ai_prof_verification_score",
            "ds"."ai_prof_min_score",
            "ds"."ai_prof_cert_level",
            "ds"."cognitive_score",
            "ds"."critical_thinking_score",
            "ds"."problem_solving_score",
            "ds"."creativity_score",
            "ds"."scaffold_convergence_trend",
            "ds"."scaffold_clarification_per_session",
            "ds"."scaffold_decomposition_per_session",
            "ds"."scaffold_consecutive_correction_runs",
            "ds"."reasoning_level_0",
            "ds"."reasoning_level_1",
            "ds"."reasoning_level_2",
            "ds"."reasoning_level_3",
            "ds"."reasoning_chain_count",
            "ds"."metacog_verification_rate",
            "ds"."metacog_reactive_rate",
            "ds"."metacog_strategic_rate",
            "ds"."pue_score",
            "ds"."pue_energy_constraint_pct",
            "ds"."pue_market_pricing_pct",
            "ds"."pue_enterprise_planning_pct",
            "ds"."pue_learner_initiated_pct",
            "ds"."pue_multi_domain_pct",
            "ds"."pue_local_context_pct",
            "ds"."role_readiness_signal",
            "ds"."role_teaching_intent_count",
            "ds"."role_community_application_count",
            "ds"."role_enterprise_orientation_count",
            "ds"."role_intergenerational_count",
            "ds"."peer_diffusion_signal",
            "ds"."cert_attempted_count",
            "ds"."cert_passed_count",
            "ds"."cert_avg_score",
            "ds"."cert_names_passed",
            "ds"."ci_tracks_active_count",
            "ds"."ci_certs_passed_count",
            "ds"."k_anon_suppressed",
            "ds"."created_at",
            "ds"."artifact_quality_score",
            "ds"."artifact_produced",
            "ds"."is_persistent_learner",
            "ds"."artifact_goal_specificity",
            "ds"."artifact_resource_spec",
            "ds"."artifact_implementation_steps",
            "ds"."artifact_constraint_integration",
            "ds"."artifact_quantitative_reasoning",
            "ds"."artifact_feasibility"
           FROM "public"."dashboard_stats" "ds"
          WHERE "ds"."k_anon_suppressed" = false
          ORDER BY "ds"."learner_token", "ds"."cohort_month", "ds"."snapshot_date" DESC
        ), "ranked" AS (
         SELECT "d"."id",
            "d"."snapshot_date",
            "d"."activity_date",
            "d"."cohort_month",
            "d"."site",
            "d"."learner_token",
            "d"."grade_band",
            "d"."activities_started_today",
            "d"."activities_completed_today",
            "d"."categories_active_today",
            "d"."certifications_earned_today",
            "d"."activities_started_total",
            "d"."activities_completed_total",
            "d"."certifications_earned_total",
            "d"."categories_ever_active",
            "d"."session_count",
            "d"."engaged_session_count",
            "d"."avg_words_per_session",
            "d"."ai_prof_application_score",
            "d"."ai_prof_ethics_score",
            "d"."ai_prof_understanding_score",
            "d"."ai_prof_verification_score",
            "d"."ai_prof_min_score",
            "d"."ai_prof_cert_level",
            "d"."cognitive_score",
            "d"."critical_thinking_score",
            "d"."problem_solving_score",
            "d"."creativity_score",
            "d"."scaffold_convergence_trend",
            "d"."scaffold_clarification_per_session",
            "d"."scaffold_decomposition_per_session",
            "d"."scaffold_consecutive_correction_runs",
            "d"."reasoning_level_0",
            "d"."reasoning_level_1",
            "d"."reasoning_level_2",
            "d"."reasoning_level_3",
            "d"."reasoning_chain_count",
            "d"."metacog_verification_rate",
            "d"."metacog_reactive_rate",
            "d"."metacog_strategic_rate",
            "d"."pue_score",
            "d"."pue_energy_constraint_pct",
            "d"."pue_market_pricing_pct",
            "d"."pue_enterprise_planning_pct",
            "d"."pue_learner_initiated_pct",
            "d"."pue_multi_domain_pct",
            "d"."pue_local_context_pct",
            "d"."role_readiness_signal",
            "d"."role_teaching_intent_count",
            "d"."role_community_application_count",
            "d"."role_enterprise_orientation_count",
            "d"."role_intergenerational_count",
            "d"."peer_diffusion_signal",
            "d"."cert_attempted_count",
            "d"."cert_passed_count",
            "d"."cert_avg_score",
            "d"."cert_names_passed",
            "d"."ci_tracks_active_count",
            "d"."ci_certs_passed_count",
            "d"."k_anon_suppressed",
            "d"."created_at",
            "d"."artifact_quality_score",
            "d"."artifact_produced",
            "d"."is_persistent_learner",
            "d"."artifact_goal_specificity",
            "d"."artifact_resource_spec",
            "d"."artifact_implementation_steps",
            "d"."artifact_constraint_integration",
            "d"."artifact_quantitative_reasoning",
            "d"."artifact_feasibility",
            ("rank"() OVER (PARTITION BY "d"."learner_token" ORDER BY "d"."cohort_month"))::integer AS "visit_rank",
            ("count"(*) OVER (PARTITION BY "d"."learner_token"))::integer AS "total_visits"
           FROM "deduped" "d"
        ), "by_visit" AS (
         SELECT "r"."visit_rank",
            "count"(DISTINCT "r"."learner_token") AS "learner_count",
            "sum"("r"."session_count") AS "total_sessions",
            "sum"("r"."certifications_earned_total") AS "total_certs",
            "round"("avg"(NULLIF("r"."cognitive_score", (0)::numeric)), 1) AS "avg_cognitive",
            "round"("avg"(NULLIF("r"."critical_thinking_score", (0)::numeric)), 1) AS "avg_critical_thinking",
            "round"("avg"(NULLIF("r"."problem_solving_score", (0)::numeric)), 1) AS "avg_problem_solving",
            "round"("avg"(NULLIF("r"."creativity_score", (0)::numeric)), 1) AS "avg_creativity",
            "round"("avg"(NULLIF("r"."scaffold_clarification_per_session", (0)::numeric)), 2) AS "avg_clarification",
            "sum"(
                CASE
                    WHEN ("r"."scaffold_convergence_trend" = 'converging'::"text") THEN 1
                    ELSE 0
                END) AS "converging_count",
            "sum"(
                CASE
                    WHEN ("r"."scaffold_convergence_trend" = ANY (ARRAY['insufficient_data'::"text", ''::"text"])) THEN 1
                    ELSE 0
                END) AS "insufficient_data_count",
            "sum"(
                CASE
                    WHEN ("r"."role_teaching_intent_count" > 0) THEN 1
                    ELSE 0
                END) AS "teaching_intent_count",
            "sum"(
                CASE
                    WHEN ("r"."role_community_application_count" > 0) THEN 1
                    ELSE 0
                END) AS "community_application_count",
            "sum"(
                CASE
                    WHEN ("r"."role_enterprise_orientation_count" > 0) THEN 1
                    ELSE 0
                END) AS "enterprise_orientation_count",
            "sum"(
                CASE
                    WHEN ("r"."role_intergenerational_count" > 0) THEN 1
                    ELSE 0
                END) AS "intergenerational_count"
           FROM "ranked" "r"
          GROUP BY "r"."visit_rank"
        )
 SELECT "v"."visit_rank",
    "v"."learner_count",
    "v"."total_sessions",
    "v"."total_certs",
    "v"."avg_cognitive",
    "v"."avg_critical_thinking",
    "v"."avg_problem_solving",
    "v"."avg_creativity",
    "v"."avg_clarification",
    "v"."converging_count",
    "v"."insufficient_data_count",
    "v"."teaching_intent_count",
    "v"."community_application_count",
    "v"."enterprise_orientation_count",
    "v"."intergenerational_count"
   FROM "by_visit" "v"
  ORDER BY "v"."visit_rank";
