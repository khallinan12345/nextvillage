-- Session bands at 25 / 50 / 100 real sessions.
--
-- The old thresholds (50 / 100 / 130) were set when session counts included
-- pre-created placeholder rows, so most learners sat in "Early". Sessions are
-- now real sessions, and the checkpoints used elsewhere (anchor tasks) are at
-- 25, 50 and 100, so the bands use the same boundaries:
--   1. Early        under 25
--   2. Developing   25-49
--   3. Established  50-99
--   4. Core         100 or more
-- Labels and the column list are unchanged, so existing callers keep working.

CREATE OR REPLACE FUNCTION public.get_session_band_stats()
RETURNS TABLE(
  session_band text, band_midpoint integer, n_learners integer,
  cognitive numeric, critical_thinking numeric, problem_solving numeric, creativity numeric,
  avg_clarification numeric, teaching_intent_pct numeric, community_application_pct numeric,
  enterprise_orientation_pct numeric, intergenerational_pct numeric
)
LANGUAGE sql
SECURITY DEFINER
AS $function$
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
        WHEN cumulative_sessions <  25  THEN '1. Early'
        WHEN cumulative_sessions <  50  THEN '2. Developing'
        WHEN cumulative_sessions <  100 THEN '3. Established'
        ELSE '4. Core'
      END AS session_band,
      CASE
        WHEN cumulative_sessions <  25  THEN 12
        WHEN cumulative_sessions <  50  THEN 37
        WHEN cumulative_sessions <  100 THEN 75
        ELSE 125
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
$function$;
