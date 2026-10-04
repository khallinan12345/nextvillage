-- Lock down SECURITY DEFINER functions exposed through the public API.
--
-- Supabase grants EXECUTE on every new public function to anon and
-- authenticated (see the default-privileges gotcha), and SECURITY DEFINER
-- functions skip RLS — so each one is a door around the table policies.
-- The database linter flagged 17 of them. Worst cases before this:
--   * find_similar_profile_candidates() returned the id, name and email of
--     every active user to anyone on the internet, signed in or not.
--   * get_research_snapshot(text,text,text) had no access check at all, so
--     anyone could pull per-learner research scores.
--   * close_grand_challenge_quarter(), carry_over_grand_submission() and
--     expire_old_enrollments() could be run by anyone.
--   * get_cohort_member_names() listed a cohort's student names to anyone
--     holding its join code — including people a leader hasn't approved.
--   * add_org_join_code() trusted a caller-supplied user id.
--
-- Rule applied: a function is callable by a role only if the app calls it
-- as that role, and it re-checks the caller itself where it reads or
-- changes anything beyond the caller's own data. service_role (Edge
-- Functions, API routes, cron) keeps every grant.

-- ── 1. Trigger functions: never meant to be called directly ──────────────
REVOKE EXECUTE ON FUNCTION public.award_bridge_tier_on_referral()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.award_multiplier_on_mentee_completion() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_org_leader_id()                     FROM PUBLIC, anon, authenticated;

-- ── 2. Server-only: cron, Edge Functions or service-role API routes ──────
-- close_grand_challenge_quarter: pg_cron (runs as postgres).
-- expire_old_enrollments: weekly Edge Functions (service role).
-- carry_over_grand_submission, get_dashboard_summary: no app caller.
-- find_similar_profile_candidates: now called only by
--   api/find-similar-profile.js, which returns at most one masked match.
REVOKE EXECUTE ON FUNCTION public.close_grand_challenge_quarter(text)                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_old_enrollments()                           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.carry_over_grand_submission(uuid, uuid, text)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_summary(uuid)                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.find_similar_profile_candidates(uuid, uuid)        FROM PUBLIC, anon, authenticated;

-- ── 3. Signed-in only (used inside RLS policies or by signed-in pages) ───
REVOKE EXECUTE ON FUNCTION public.get_my_profile()                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_effective_profile()      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_together_room_status(uuid)  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_profile()                TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_my_effective_profile()      TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_together_room_status(uuid)  TO authenticated;

-- get_longitudinal_summary skips its role check when auth.uid() is NULL
-- (meant for the SQL editor) — which was also true for anon callers.
REVOKE EXECUTE ON FUNCTION public.get_longitudinal_summary(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_longitudinal_summary(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_research_snapshot(text, date, date, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_research_snapshot(text, date, date, text) TO authenticated;

-- ── 4. Functions that now check the caller ────────────────────────────────

-- Primary leader adds a join code — use the real caller, not a parameter.
-- (requesting_user_id stays in the signature so existing callers work; it
-- must match the signed-in user.)
CREATE OR REPLACE FUNCTION public.add_org_join_code(org_id uuid, requesting_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code text;
BEGIN
  IF auth.uid() IS NULL OR requesting_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the primary organization leader can generate join codes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations o
                 WHERE o.id = org_id AND o.leader_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only the primary organization leader can generate join codes';
  END IF;
  SELECT generate_join_code() INTO new_code;
  UPDATE organizations SET join_codes = join_codes || new_code WHERE id = org_id;
  RETURN new_code;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.add_org_join_code(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.add_org_join_code(uuid, uuid) TO authenticated;

-- Cohort leaderboard names: only for approved members of that cohort's
-- organization (or platform admins), and only approved students are listed.
CREATE OR REPLACE FUNCTION public.get_cohort_member_names(p_join_code text)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name
  FROM profiles p
  WHERE p.join_code_used = p_join_code
    AND p.role = 'student'
    AND p.membership_status = 'approved'
    AND (
      (SELECT role FROM get_my_profile()) = 'platform_administrator'
      OR org_id_for_join_code(p_join_code) = (SELECT organization_id FROM get_my_effective_profile())
    );
$$;
REVOKE EXECUTE ON FUNCTION public.get_cohort_member_names(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_cohort_member_names(text) TO authenticated;

-- Research snapshot (the overload ResearchDataExplorer calls) had no access
-- check. Same roles as the other overload; service role (no auth.uid())
-- still passes, and anon can no longer reach it at all.
CREATE OR REPLACE FUNCTION public.assert_research_access()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND coalesce((SELECT role FROM get_my_profile()), '') NOT IN ('research_lead', 'platform_administrator', 'site_leader') THEN
    RAISE EXCEPTION 'Access denied: research role required';
  END IF;
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.assert_research_access() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_research_snapshot(p_site text DEFAULT NULL::text, p_from_month text DEFAULT NULL::text, p_to_month text DEFAULT NULL::text)
 RETURNS TABLE(learner_token text, site text, cohort_month date, grade_band text, assessment_cycle integer, is_persistent_learner boolean, mentor_present boolean, session_count integer, engaged_session_count integer, avg_words_per_session numeric, activities_started_total integer, activities_completed_total integer, activities_started_today integer, activities_completed_today integer, certifications_earned_today integer, certifications_earned_total integer, cert_names_passed text[], k_anon_suppressed boolean, ai_prof_application_score numeric, ai_prof_ethics_score numeric, ai_prof_understanding_score numeric, ai_prof_verification_score numeric, ai_prof_min_score numeric, ai_prof_cert_level text, cognitive_score numeric, critical_thinking_score numeric, problem_solving_score numeric, creativity_score numeric, reasoning_level_0 numeric, reasoning_level_1 numeric, reasoning_level_2 numeric, reasoning_level_3 numeric, reasoning_chain_count integer, metacog_verification_rate numeric, metacog_reactive_rate numeric, metacog_strategic_rate numeric, scaffold_convergence_trend text, scaffold_clarification_per_session numeric, scaffold_decomposition_per_session numeric, scaffold_consecutive_correction_runs numeric, pue_score numeric, pue_energy_constraint_pct numeric, pue_market_pricing_pct numeric, pue_enterprise_planning_pct numeric, pue_learner_initiated_pct numeric, pue_multi_domain_pct numeric, pue_local_context_pct numeric, role_readiness_signal integer, role_teaching_intent_count integer, role_community_application_count integer, role_enterprise_orientation_count integer, role_intergenerational_count integer, peer_diffusion_signal integer, cert_attempted_count integer, cert_passed_count integer, cert_avg_score numeric, ci_tracks_active_count integer, ci_certs_passed_count integer, artifact_quality_score numeric, artifact_produced boolean, artifact_goal_specificity numeric, artifact_resource_spec numeric, artifact_implementation_steps numeric, artifact_constraint_integration numeric, artifact_quantitative_reasoning numeric, artifact_feasibility numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
  WITH
  access_ok AS (
    SELECT public.assert_research_access() AS ok
  ),

  learner_history AS (
    SELECT
      learner_token,
      cohort_month,
      RANK() OVER (
        PARTITION BY learner_token
        ORDER BY cohort_month
      )::INTEGER                                           AS assessment_cycle,
      COUNT(*) OVER (PARTITION BY learner_token)::INTEGER AS total_months
    FROM dashboard_stats
    WHERE learner_token IS NOT NULL
  ),

  base AS (
    SELECT
      ds.*,
      lh.assessment_cycle,
      (lh.total_months >= 2)                             AS computed_persistent
    FROM dashboard_stats ds
    CROSS JOIN access_ok a
    LEFT JOIN learner_history lh
      ON  ds.learner_token = lh.learner_token
      AND ds.cohort_month  = lh.cohort_month
    WHERE
      a.ok
      AND (p_site       IS NULL OR ds.site          =  p_site)
      AND (p_from_month IS NULL OR ds.cohort_month >= p_from_month::DATE)
      AND (p_to_month   IS NULL OR ds.cohort_month <= (p_to_month::DATE + INTERVAL '1 month' - INTERVAL '1 day')::DATE)
  )

  SELECT
    b.learner_token,
    b.site,
    b.cohort_month,
    b.grade_band,

    b.assessment_cycle,
    b.computed_persistent                                  AS is_persistent_learner,

    COALESCE(
      (SELECT smp.mentor_present
       FROM site_mentor_presence smp
       WHERE smp.site = b.site
         AND b.cohort_month BETWEEN smp.period_start AND smp.period_end
       LIMIT 1),
      TRUE
    )                                                      AS mentor_present,

    b.session_count,
    b.engaged_session_count,
    b.avg_words_per_session,

    b.activities_started_total,
    b.activities_completed_total,
    b.activities_started_today,
    b.activities_completed_today,
    b.certifications_earned_today,
    b.certifications_earned_total,
    b.cert_names_passed,
    b.k_anon_suppressed,

    b.ai_prof_application_score,
    b.ai_prof_ethics_score,
    b.ai_prof_understanding_score,
    b.ai_prof_verification_score,
    b.ai_prof_min_score,
    b.ai_prof_cert_level,

    b.cognitive_score,
    b.critical_thinking_score,
    b.problem_solving_score,
    b.creativity_score,

    b.reasoning_level_0,
    b.reasoning_level_1,
    b.reasoning_level_2,
    b.reasoning_level_3,
    b.reasoning_chain_count,

    b.metacog_verification_rate,
    b.metacog_reactive_rate,
    b.metacog_strategic_rate,

    b.scaffold_convergence_trend,
    b.scaffold_clarification_per_session,
    b.scaffold_decomposition_per_session,
    b.scaffold_consecutive_correction_runs,

    b.pue_score,
    b.pue_energy_constraint_pct,
    b.pue_market_pricing_pct,
    b.pue_enterprise_planning_pct,
    b.pue_learner_initiated_pct,
    b.pue_multi_domain_pct,
    b.pue_local_context_pct,

    b.role_readiness_signal,
    b.role_teaching_intent_count,
    b.role_community_application_count,
    b.role_enterprise_orientation_count,
    b.role_intergenerational_count,
    b.peer_diffusion_signal,

    b.cert_attempted_count,
    b.cert_passed_count,
    b.cert_avg_score,
    b.ci_tracks_active_count,
    b.ci_certs_passed_count,

    b.artifact_quality_score,
    b.artifact_produced,
    b.artifact_goal_specificity,
    b.artifact_resource_spec,
    b.artifact_implementation_steps,
    b.artifact_constraint_integration,
    b.artifact_quantitative_reasoning,
    b.artifact_feasibility

  FROM base b
  ORDER BY b.site, b.learner_token, b.cohort_month;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_research_snapshot(text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_research_snapshot(text, text, text) TO authenticated;

-- ── 5. Deliberately left public ──────────────────────────────────────────
-- get_session_band_stats(): aggregate stats on the public landing page,
--   built only from k-anonymity-safe rows (k_anon_suppressed = false).
-- check_email_exists(): sign-up's "account already exists" check. Reveals
--   only whether an email is registered; Supabase's own sign-up and
--   password-reset flows reveal the same.
-- find_org_by_join_code(), generate_join_code(), review_membership(),
--   get_organization_learner_count(): signed-in only, already scoped
--   (20261004163910_member_approval_and_role_guard.sql).
