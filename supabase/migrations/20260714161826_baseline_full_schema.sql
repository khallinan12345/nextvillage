-- Baseline schema snapshot — created 2026-07-14.
--
-- This migration replaces the 8 files previously in this folder (now in
-- supabase/migrations_archive/, kept for historical reference only). Those
-- files covered a fraction of the actual live schema — years of changes
-- were made directly through the Supabase dashboard and never captured in
-- a migration, and two of the archived files used non-idempotent
-- CREATE TABLE / CREATE POLICY statements that made the chain impossible
-- to replay from an empty database. See supabase/migrations_archive/README.md
-- for the full explanation.
--
-- This file is the complete, accurate public schema as of 2026-07-14,
-- captured via `supabase db dump --schema public` against the live
-- database. It was NOT executed against production — production already
-- has this exact state; this migration exists so a fresh database (local
-- dev, staging, disaster recovery) can be built from this folder and
-- actually match reality. All future schema changes should be new
-- migration files layered on top of this one.



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."progress_status" AS ENUM (
    'not started',
    'started',
    'completed'
);


ALTER TYPE "public"."progress_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'student',
    'teacher',
    'facilitator',
    'learner',
    'leader',
    'platform_administrator',
    'site_leader',
    'research_lead'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_org_join_code"("org_id" "uuid", "requesting_user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  new_code  text;
  is_leader boolean;
begin
  select (leader_id = requesting_user_id)
  into   is_leader
  from   organizations
  where  id = org_id;

  if not is_leader then
    raise exception 'Only the primary organization leader can generate join codes';
  end if;

  select generate_join_code() into new_code;

  update organizations
  set    join_codes = join_codes || new_code
  where  id = org_id;

  return new_code;
end;
$$;


ALTER FUNCTION "public"."add_org_join_code"("org_id" "uuid", "requesting_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."award_bridge_tier_on_referral"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.referral_enrollee_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
    AND OLD.referral_enrollee_id IS NOT DISTINCT FROM NEW.referral_enrollee_id
  THEN RETURN NEW; END IF;

  INSERT INTO community_impact_tiers (
    learner_id, org_id, tier, tier_label,
    challenge_id, enrollment_id,
    referred_learner_id, evidence_summary
  ) VALUES (
    NEW.learner_id, NEW.org_id,
    'bridge', 'community connector',
    NEW.challenge_id, NEW.id,
    NEW.referral_enrollee_id,
    'Brought a community member to the hub who enrolled on the platform'
  )
  ON CONFLICT DO NOTHING;

  UPDATE challenge_enrollments
  SET status = 'awarded', tier_awarded = 'bridge', awarded_at = now()
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."award_bridge_tier_on_referral"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."award_multiplier_on_mentee_completion"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_mentor_id    uuid;
  v_org_id       text;
  v_challenge_id uuid;
  v_prior_awards int;
BEGIN
  IF NEW.status != 'awarded' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'awarded' THEN RETURN NEW; END IF;

  SELECT ce.learner_id, ce.org_id, ce.challenge_id
  INTO v_mentor_id, v_org_id, v_challenge_id
  FROM challenge_enrollments ce
  WHERE ce.referral_enrollee_id = NEW.learner_id
  LIMIT 1;

  IF v_mentor_id IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_prior_awards
  FROM challenge_enrollments
  WHERE learner_id = NEW.learner_id AND status = 'awarded';

  IF v_prior_awards > 1 THEN RETURN NEW; END IF;

  INSERT INTO community_impact_tiers (
    learner_id, org_id, tier, tier_label,
    challenge_id, enrollment_id, evidence_summary
  ) VALUES (
    v_mentor_id, v_org_id,
    'multiplier', 'village leader',
    v_challenge_id, NEW.id,
    'Recruited and mentored a learner who completed their first community AI challenge'
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."award_multiplier_on_mentee_completion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backfill_dashboard_stats"("start_date" "date" DEFAULT '2025-07-01'::"date", "end_date" "date" DEFAULT NULL::"date") RETURNS TABLE("day" "date", "rows_written" integer, "rows_suppressed" integer)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_date       date;
  v_end        date;
  v_month      date;
  v_next_month date;
  v_written    integer;
  v_suppressed integer;
  K_ANON_MIN   constant integer := 5;
BEGIN
  v_end  := COALESCE(end_date, CURRENT_DATE);
  v_date := start_date;

  WHILE v_date <= v_end LOOP
    v_month      := date_trunc('month', v_date)::date;
    v_next_month := v_month + interval '1 month';

    DELETE FROM dashboard_stats WHERE activity_date = v_date;

    WITH
    latest_assessments AS (
      SELECT DISTINCT ON (uma.user_id)
        uma.user_id,
        uma.session_count, uma.engaged_session_count, uma.avg_words_per_session,
        uma.cognitive_score, uma.critical_thinking_score,
        uma.problem_solving_score, uma.creativity_score,
        uma.pue_score, uma.pue_energy_constraint_pct, uma.pue_market_pricing_pct,
        uma.pue_enterprise_planning_pct, uma.pue_learner_initiated_pct,
        uma.pue_multi_domain_pct, uma.pue_local_context_pct,
        uma.scaffold_convergence_trend, uma.scaffold_clarification_per_session,
        uma.scaffold_decomposition_per_session, uma.scaffold_consecutive_correction_runs,
        uma.reasoning_level_0, uma.reasoning_level_1,
        uma.reasoning_level_2, uma.reasoning_level_3, uma.reasoning_chain_count,
        uma.metacog_verification_rate, uma.metacog_reactive_rate, uma.metacog_strategic_rate,
        uma.role_readiness_signal, uma.role_teaching_intent_count,
        uma.role_community_application_count, uma.role_enterprise_orientation_count,
        uma.role_intergenerational_count, uma.peer_diffusion_signal,
        uma.cert_attempted_count, uma.cert_passed_count,
        uma.cert_avg_score, uma.cert_names_passed,
        uma.ci_tracks_active_count, uma.ci_certs_passed_count,
        uma.ai_prof_application_score, uma.ai_prof_ethics_score,
        uma.ai_prof_understanding_score, uma.ai_prof_verification_score,
        uma.ai_prof_min_score, uma.ai_prof_cert_level
      FROM user_monthly_assessments uma
      WHERE uma.measured_at >= v_month
        AND uma.measured_at < v_next_month
      ORDER BY uma.user_id, uma.measured_at DESC
    ),
    daily_activity AS (
      SELECT
        d.user_id,
        COUNT(*) FILTER (WHERE d.created_at::date = v_date)                        AS started_today,
        COUNT(*) FILTER (WHERE d.updated_at::date = v_date
                           AND d.progress = 'completed')                           AS completed_today,
        COUNT(*) FILTER (WHERE d.updated_at::date = v_date
                           AND d.certificate_pdf_url IS NOT NULL)                  AS certs_today,
        array_agg(DISTINCT d.category_activity) FILTER (
          WHERE d.category_activity IS NOT NULL
            AND d.created_at::date = v_date)                                       AS categories_today
      FROM dashboard d
      GROUP BY d.user_id
    ),
    cumulative_activity AS (
      SELECT
        d.user_id,
        COUNT(*) FILTER (WHERE d.created_at::date <= v_date)                       AS started_total,
        COUNT(*) FILTER (WHERE d.updated_at::date <= v_date
                           AND d.progress = 'completed')                           AS completed_total,
        COUNT(*) FILTER (WHERE d.updated_at::date <= v_date
                           AND d.certificate_pdf_url IS NOT NULL)                  AS certs_total,
        array_agg(DISTINCT d.category_activity) FILTER (
          WHERE d.category_activity IS NOT NULL
            AND d.created_at::date <= v_date)                                      AS categories_total
      FROM dashboard d
      GROUP BY d.user_id
    ),
    all_users AS (
      SELECT user_id FROM latest_assessments
      UNION
      SELECT user_id FROM daily_activity WHERE started_today > 0
    ),
    joined AS (
      SELECT
        au.user_id,
        resolve_site(p.city, p.country)             AS site,
        grade_band(p.grade_level)                   AS grade_band_val,
        COALESCE(da.started_today,   0)             AS activities_started_today,
        COALESCE(da.completed_today, 0)             AS activities_completed_today,
        da.categories_today                         AS categories_active_today,
        COALESCE(da.certs_today,     0)             AS certifications_earned_today,
        COALESCE(ca.started_total,   0)             AS activities_started_total,
        COALESCE(ca.completed_total, 0)             AS activities_completed_total,
        COALESCE(ca.certs_total,     0)             AS certifications_earned_total,
        ca.categories_total                         AS categories_ever_active,
        la.session_count, la.engaged_session_count, la.avg_words_per_session,
        la.ai_prof_application_score, la.ai_prof_ethics_score,
        la.ai_prof_understanding_score, la.ai_prof_verification_score,
        la.ai_prof_min_score, la.ai_prof_cert_level,
        la.cognitive_score, la.critical_thinking_score,
        la.problem_solving_score, la.creativity_score,
        la.scaffold_convergence_trend, la.scaffold_clarification_per_session,
        la.scaffold_decomposition_per_session, la.scaffold_consecutive_correction_runs,
        la.reasoning_level_0, la.reasoning_level_1,
        la.reasoning_level_2, la.reasoning_level_3, la.reasoning_chain_count,
        la.metacog_verification_rate, la.metacog_reactive_rate, la.metacog_strategic_rate,
        la.pue_score, la.pue_energy_constraint_pct, la.pue_market_pricing_pct,
        la.pue_enterprise_planning_pct, la.pue_learner_initiated_pct,
        la.pue_multi_domain_pct, la.pue_local_context_pct,
        la.role_readiness_signal, la.role_teaching_intent_count,
        la.role_community_application_count, la.role_enterprise_orientation_count,
        la.role_intergenerational_count, la.peer_diffusion_signal,
        la.cert_attempted_count, la.cert_passed_count,
        la.cert_avg_score, la.cert_names_passed,
        la.ci_tracks_active_count, la.ci_certs_passed_count
      FROM all_users au
      LEFT JOIN profiles p             ON p.id = au.user_id
      LEFT JOIN latest_assessments la  ON la.user_id = au.user_id
      LEFT JOIN daily_activity da      ON da.user_id = au.user_id
      LEFT JOIN cumulative_activity ca ON ca.user_id = au.user_id
    ),
    cohort_counts AS (
      SELECT site, COUNT(DISTINCT user_id) AS cohort_size
      FROM joined GROUP BY site
    )
    INSERT INTO dashboard_stats (
      snapshot_date, activity_date, cohort_month, site, learner_token, grade_band,
      activities_started_today, activities_completed_today,
      categories_active_today, certifications_earned_today,
      activities_started_total, activities_completed_total,
      certifications_earned_total, categories_ever_active,
      session_count, engaged_session_count, avg_words_per_session,
      ai_prof_application_score, ai_prof_ethics_score,
      ai_prof_understanding_score, ai_prof_verification_score,
      ai_prof_min_score, ai_prof_cert_level,
      cognitive_score, critical_thinking_score,
      problem_solving_score, creativity_score,
      scaffold_convergence_trend, scaffold_clarification_per_session,
      scaffold_decomposition_per_session, scaffold_consecutive_correction_runs,
      reasoning_level_0, reasoning_level_1, reasoning_level_2, reasoning_level_3,
      reasoning_chain_count,
      metacog_verification_rate, metacog_reactive_rate, metacog_strategic_rate,
      pue_score, pue_energy_constraint_pct, pue_market_pricing_pct,
      pue_enterprise_planning_pct, pue_learner_initiated_pct,
      pue_multi_domain_pct, pue_local_context_pct,
      role_readiness_signal, role_teaching_intent_count,
      role_community_application_count, role_enterprise_orientation_count,
      role_intergenerational_count, peer_diffusion_signal,
      cert_attempted_count, cert_passed_count, cert_avg_score, cert_names_passed,
      ci_tracks_active_count, ci_certs_passed_count,
      k_anon_suppressed
    )
    SELECT
      CURRENT_DATE, v_date, v_month, j.site,
      learner_token(j.user_id), j.grade_band_val,
      j.activities_started_today, j.activities_completed_today,
      j.categories_active_today, j.certifications_earned_today,
      j.activities_started_total, j.activities_completed_total,
      j.certifications_earned_total, j.categories_ever_active,
      j.session_count, j.engaged_session_count, j.avg_words_per_session,
      j.ai_prof_application_score, j.ai_prof_ethics_score,
      j.ai_prof_understanding_score, j.ai_prof_verification_score,
      j.ai_prof_min_score, j.ai_prof_cert_level,
      j.cognitive_score, j.critical_thinking_score,
      j.problem_solving_score, j.creativity_score,
      j.scaffold_convergence_trend, j.scaffold_clarification_per_session,
      j.scaffold_decomposition_per_session, j.scaffold_consecutive_correction_runs,
      j.reasoning_level_0, j.reasoning_level_1, j.reasoning_level_2, j.reasoning_level_3,
      j.reasoning_chain_count,
      j.metacog_verification_rate, j.metacog_reactive_rate, j.metacog_strategic_rate,
      j.pue_score, j.pue_energy_constraint_pct, j.pue_market_pricing_pct,
      j.pue_enterprise_planning_pct, j.pue_learner_initiated_pct,
      j.pue_multi_domain_pct, j.pue_local_context_pct,
      j.role_readiness_signal, j.role_teaching_intent_count,
      j.role_community_application_count, j.role_enterprise_orientation_count,
      j.role_intergenerational_count, j.peer_diffusion_signal,
      j.cert_attempted_count, j.cert_passed_count, j.cert_avg_score, j.cert_names_passed,
      j.ci_tracks_active_count, j.ci_certs_passed_count,
      CASE WHEN cc.cohort_size < K_ANON_MIN THEN true ELSE false END
    FROM joined j
    JOIN cohort_counts cc ON cc.site = j.site;

    GET DIAGNOSTICS v_written = ROW_COUNT;

    SELECT COUNT(*) INTO v_suppressed
    FROM dashboard_stats
    WHERE activity_date = v_date AND k_anon_suppressed = true;

    RAISE NOTICE 'Day %: % rows written, % suppressed', v_date, v_written, v_suppressed;
    day := v_date; rows_written := v_written; rows_suppressed := v_suppressed;
    RETURN NEXT;

    v_date := v_date + 1;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."backfill_dashboard_stats"("start_date" "date", "end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."carry_over_grand_submission"("p_source_id" "uuid", "p_learner_id" "uuid", "p_new_quarter" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_source grand_challenge_submissions%ROWTYPE;
  v_new_id uuid;
BEGIN
  SELECT * INTO v_source
  FROM grand_challenge_submissions
  WHERE id = p_source_id AND learner_id = p_learner_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source submission not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM grand_challenge_submissions
    WHERE learner_id = p_learner_id
      AND quarter = p_new_quarter
      AND status NOT IN ('expired')
  ) THEN
    RAISE EXCEPTION 'Active submission already exists for %', p_new_quarter;
  END IF;

  INSERT INTO grand_challenge_submissions (
    learner_id, org_id, quarter,
    title, community_member_name, community_member_role,
    community_impact_slug, impact_arc, journal_entry_ids,
    status, carried_over_from, is_expansion
  ) VALUES (
    p_learner_id, v_source.org_id, p_new_quarter,
    v_source.title || ' (continued)',
    v_source.community_member_name,
    v_source.community_member_role,
    v_source.community_impact_slug,
    '[Continuing from ' || v_source.quarter || ']' || E'\n\n'
      || v_source.impact_arc || E'\n\n[New developments this quarter]\n',
    v_source.journal_entry_ids,
    'draft', p_source_id, true
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;


ALTER FUNCTION "public"."carry_over_grand_submission"("p_source_id" "uuid", "p_learner_id" "uuid", "p_new_quarter" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."close_grand_challenge_quarter"("p_quarter" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE grand_challenge_submissions
  SET status = 'expired'
  WHERE quarter = p_quarter AND status = 'draft';

  UPDATE grand_challenge_quarters
  SET active = false
  WHERE quarter = p_quarter;

  UPDATE grand_challenge_quarters
  SET active = true
  WHERE start_date = (
    SELECT MIN(start_date) FROM grand_challenge_quarters
    WHERE start_date > (
      SELECT submission_deadline FROM grand_challenge_quarters
      WHERE quarter = p_quarter
    )
    AND active = false
  );

  INSERT INTO platform_news (title, body, link, link_label, emoji, active)
  SELECT
    '🏆 Grand Challenge ' || gq.quarter || ' is now open',
    'A new 3-month Grand Challenge begins today. Document your community impact across multiple visits, build your field journal, and submit your story by ' ||
    TO_CHAR(gq.submission_deadline, 'DD Month YYYY') || '. The AI agent selects the winner on ' ||
    TO_CHAR(gq.winner_announced_date, 'DD Month YYYY') || '. Start your journal in the Community Impact pages.',
    '/dashboard',
    'Start your story',
    '🌍',
    true
  FROM grand_challenge_quarters gq
  WHERE gq.active = true
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."close_grand_challenge_quarter"("p_quarter" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_grade_appropriate_dashboard_activities_by_continent"("user_id_param" "uuid", "continent_param" "text") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  user_grade   integer;
  inserted_cnt integer := 0;
BEGIN
  -- look up or default the grade
  SELECT grade_level
    INTO user_grade
    FROM profiles
   WHERE id = user_id_param;
  IF user_grade IS NULL THEN
    user_grade := 3;
  END IF;

  -- update any existing dashboard rows
  UPDATE dashboard d
     SET sub_category = lm.sub_category,
         grade_level  = lm.grade_level,
         continent    = lm.continent,
         updated_at   = now()
    FROM learning_modules lm
   WHERE d.learning_module_id = lm.learning_module_id
     AND d.user_id            = user_id_param
     AND lm.continent         = continent_param;

  -- insert missing activities
  INSERT INTO dashboard (
    user_id,
    learning_module_id,
    activity,
    title,
    category_activity,
    sub_category,
    grade_level,
    continent,
    progress,
    created_at,
    updated_at
  )
  SELECT
    user_id_param,
    lm.learning_module_id,
    lm.title,
    lm.title,
    lm.category,
    lm.sub_category,
    lm.grade_level,
    lm.continent,
    'not started'::progress_status,  -- use your exact enum label
    now(),
    now()
  FROM learning_modules lm
  WHERE lm.continent  = continent_param
    AND lm.public     = 1
    AND (lm.grade_level = user_grade OR lm.grade_level = 4)
    AND NOT EXISTS (
      SELECT 1
        FROM dashboard d2
       WHERE d2.user_id            = user_id_param
         AND d2.learning_module_id = lm.learning_module_id
    );

  -- capture how many rows we just inserted
  GET DIAGNOSTICS inserted_cnt = ROW_COUNT;
  RETURN inserted_cnt;
END;
$$;


ALTER FUNCTION "public"."create_grade_appropriate_dashboard_activities_by_continent"("user_id_param" "uuid", "continent_param" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_grade_appropriate_dashboard_activities_by_country"("user_id_param" "uuid", "country_param" "text") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$DECLARE
    user_grade INTEGER;
    inserted_count INTEGER := 0;
BEGIN
    -- Get user's grade level
    SELECT grade_level INTO user_grade 
    FROM profiles 
    WHERE id = user_id_param;
    
    -- Default to grade 3 if not set
    IF user_grade IS NULL THEN
        user_grade := 4;
    END IF;
    
    -- Insert dashboard activities for user's grade AND grade 4
    INSERT INTO dashboard (
        user_id, 
        learning_module_id,
        activity, 
        title,
        category_activity,
        sub_category,
        grade_level,  -- THIS WAS MISSING IN THE OLD FUNCTION
        continent,      
        progress, 
        created_at, 
        updated_at
    )
    SELECT 
        user_id_param,
        lm.learning_module_id,
        lm.title,
        lm.title,
        lm.category,
        lm.sub_category,
        lm.grade_level,  
        lm.continent,      
        'not started',
        NOW(),
        NOW()
    FROM learning_modules lm
    WHERE lm.country = country_param
    AND lm.public = 1
    AND (
        lm.grade_level = user_grade    -- User's grade (3)
        OR lm.grade_level = 4          -- ALWAYS include grade 4
    )
    AND NOT EXISTS (
        SELECT 1 FROM dashboard d 
        WHERE d.user_id = user_id_param 
        AND d.learning_module_id = lm.learning_module_id
    );
    
    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    RETURN inserted_count;
END;$$;


ALTER FUNCTION "public"."create_grade_appropriate_dashboard_activities_by_country"("user_id_param" "uuid", "country_param" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_from_leaderboard_view"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Replace 'profiles' with your actual underlying table name
    DELETE FROM profiles 
    WHERE learner_id = OLD.learner_id;
    
    RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."delete_from_leaderboard_view"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_old_enrollments"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE challenge_enrollments
  SET status = 'expired'
  WHERE status = 'active'
    AND checked_out_at < now() - INTERVAL '7 days';
END;
$$;


ALTER FUNCTION "public"."expire_old_enrollments"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_org_by_join_code"("lookup_code" "text") RETURNS TABLE("id" "uuid", "name" "text", "continent" "text", "country" "text", "state" "text", "city" "text", "learner_age_min" integer, "learner_age_max" integer, "learner_gender" "text")
    LANGUAGE "sql" STABLE
    AS $$
  select
    id, name, continent, country, state, city,
    learner_age_min, learner_age_max,
    learner_gender::text
  from organizations
  where upper(lookup_code) = any(join_codes)
  limit 1;
$$;


ALTER FUNCTION "public"."find_org_by_join_code"("lookup_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_join_code"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  chars  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code   text;
  taken  boolean;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;
    select exists(
      select 1 from organizations where code = any(join_codes)
    ) into taken;
    exit when not taken;
  end loop;
  return code;
end;
$$;


ALTER FUNCTION "public"."generate_join_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_team_code"() RETURNS character varying
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    chars VARCHAR(36) := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result VARCHAR(5) := '';
    i INTEGER;
    char_index INTEGER;
BEGIN
    -- Generate 5 random characters
    FOR i IN 1..5 LOOP
        char_index := floor(random() * length(chars) + 1)::INTEGER;
        result := result || substr(chars, char_index, 1);
    END LOOP;
    
    -- Check if this code already exists, if so, try again
    WHILE EXISTS (SELECT 1 FROM teams WHERE team_code = result) LOOP
        result := '';
        FOR i IN 1..5 LOOP
            char_index := floor(random() * length(chars) + 1)::INTEGER;
            result := result || substr(chars, char_index, 1);
        END LOOP;
    END LOOP;
    
    RETURN result;
END;
$$;


ALTER FUNCTION "public"."generate_team_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_summary"("user_id_param" "uuid") RETURNS TABLE("total_activities" integer, "completed" integer, "started" integer, "not_started" integer, "average_score" numeric, "latest_activity" "text", "latest_update" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_activities,
        COUNT(CASE WHEN progress = 'completed' THEN 1 END)::INTEGER as completed,
        COUNT(CASE WHEN progress = 'started' THEN 1 END)::INTEGER as started,
        COUNT(CASE WHEN progress = 'not started' THEN 1 END)::INTEGER as not_started,
        ROUND(AVG(evaluation_score), 2) as average_score,
        (SELECT activity FROM dashboard WHERE user_id = user_id_param ORDER BY updated_at DESC LIMIT 1) as latest_activity,
        MAX(updated_at) as latest_update
    FROM dashboard
    WHERE user_id = user_id_param;
END;
$$;


ALTER FUNCTION "public"."get_dashboard_summary"("user_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_longitudinal_summary"("p_site" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_result jsonb;
  K_MIN    constant integer := 5;
BEGIN
  -- Role check: bypass when running as service role (SQL editor, Edge Functions)
  -- auth.uid() is NULL in service role context
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('research_lead', 'platform_administrator',
                            'site_leader', 'student', 'teacher')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  WITH
  -- Base: one row per learner per month (most recent snapshot)
  base AS (
    SELECT DISTINCT ON (learner_token, cohort_month)
      learner_token,
      site,
      cohort_month,
      activity_date,
      session_count,
      engaged_session_count,
      avg_words_per_session,
      pue_score,
      cognitive_score,
      critical_thinking_score,
      problem_solving_score,
      creativity_score,
      ai_prof_min_score,
      activities_completed_total,
      certifications_earned_total,
      scaffold_convergence_trend,
      reasoning_level_3,
      metacog_strategic_rate
    FROM dashboard_stats
    WHERE k_anon_suppressed = false
      AND (p_site IS NULL OR site = p_site)
    ORDER BY learner_token, cohort_month, activity_date DESC
  ),

  -- Aggregate metrics per learner (no window functions)
  agg AS (
    SELECT
      learner_token,
      site,
      COUNT(DISTINCT cohort_month)           AS months_active,
      MIN(cohort_month)                      AS first_month,
      MAX(cohort_month)                      AS last_month,
      ROUND(AVG(session_count)::numeric, 1)  AS avg_sessions_per_month,
      SUM(session_count)                     AS total_sessions,
      ROUND(AVG(pue_score)::numeric, 1)      AS avg_pue,
      ROUND(AVG(cognitive_score)::numeric, 1)AS avg_cognitive,
      MAX(certifications_earned_total)       AS certs_earned,
      MAX(activities_completed_total)        AS activities_completed
    FROM base
    GROUP BY learner_token, site
  ),

  -- Earliest month row per learner (for starting values)
  earliest AS (
    SELECT DISTINCT ON (learner_token)
      learner_token,
      ai_prof_min_score AS starting_prof
    FROM base
    ORDER BY learner_token, cohort_month ASC
  ),

  -- Latest month row per learner (for ending values and latest metrics)
  latest AS (
    SELECT DISTINCT ON (learner_token)
      learner_token,
      ai_prof_min_score         AS ending_prof,
      scaffold_convergence_trend AS latest_scaffold_trend,
      reasoning_level_3          AS latest_reasoning_l3,
      metacog_strategic_rate     AS latest_metacog_strategic
    FROM base
    ORDER BY learner_token, cohort_month DESC
  ),

  -- Final learner summary: join aggregate + earliest + latest
  learner_summary AS (
    SELECT
      a.learner_token,
      a.site,
      a.months_active,
      a.first_month,
      a.last_month,
      a.avg_sessions_per_month,
      a.total_sessions,
      a.avg_pue,
      a.avg_cognitive,
      a.certs_earned,
      a.activities_completed,
      e.starting_prof,
      l.ending_prof,
      CASE WHEN l.ending_prof IS NOT NULL AND e.starting_prof IS NOT NULL
           THEN l.ending_prof - e.starting_prof ELSE NULL END AS prof_gain,
      l.latest_scaffold_trend,
      l.latest_reasoning_l3,
      l.latest_metacog_strategic,
      -- Flag suspicious records for data quality notes
      CASE WHEN a.total_sessions = 0 AND a.avg_pue > 50 THEN true ELSE false END
        AS possible_admin_account
    FROM agg a
    LEFT JOIN earliest e ON e.learner_token = a.learner_token
    LEFT JOIN latest   l ON l.learner_token = a.learner_token
  ),

  -- Monthly cohort snapshots
  monthly_cohort AS (
    SELECT
      cohort_month,
      site,
      COUNT(DISTINCT learner_token)                   AS unique_learners,
      ROUND(AVG(session_count)::numeric, 1)           AS avg_sessions,
      ROUND(AVG(pue_score)::numeric, 1)               AS avg_pue,
      ROUND(AVG(cognitive_score)::numeric, 1)         AS avg_cognitive,
      SUM(activities_completed_today)                 AS completions,
      SUM(certifications_earned_today)                AS certs
    FROM dashboard_stats
    WHERE k_anon_suppressed = false
      AND (p_site IS NULL OR site = p_site)
    GROUP BY cohort_month, site
    ORDER BY cohort_month
  )

  SELECT jsonb_build_object(

    -- ── Overall cohort stats ─────────────────────────────────────────────────
    'cohort', jsonb_build_object(
      'total_unique_learners',    (SELECT COUNT(DISTINCT learner_token) FROM learner_summary),
      'sites',                    (SELECT jsonb_agg(site) FROM (SELECT DISTINCT site FROM learner_summary) s),
      'date_range',               jsonb_build_object(
        'first', (SELECT MIN(first_month) FROM learner_summary),
        'last',  (SELECT MAX(last_month)  FROM learner_summary)
      ),
      'avg_months_active',        (SELECT ROUND(AVG(months_active)::numeric, 1) FROM learner_summary),
      'avg_sessions_per_month',   (SELECT ROUND(AVG(avg_sessions_per_month)::numeric, 1) FROM learner_summary),
      'avg_pue',                  (SELECT ROUND(AVG(avg_pue)::numeric, 1) FROM learner_summary WHERE avg_pue IS NOT NULL),
      'avg_cognitive',            (SELECT ROUND(AVG(avg_cognitive)::numeric, 1) FROM learner_summary WHERE avg_cognitive IS NOT NULL),
      'total_certs_earned',       (SELECT SUM(certs_earned) FROM learner_summary),
      'total_activities_completed',(SELECT SUM(activities_completed) FROM learner_summary)
    ),

    -- ── Persistence tiers ────────────────────────────────────────────────────
    'persistence', jsonb_build_object(
      'highly_persistent',  (SELECT COUNT(*) FROM learner_summary WHERE months_active >= 4),
      'moderately_persistent', (SELECT COUNT(*) FROM learner_summary WHERE months_active BETWEEN 2 AND 3),
      'single_month',       (SELECT COUNT(*) FROM learner_summary WHERE months_active = 1),
      'most_persistent_months', (SELECT MAX(months_active) FROM learner_summary),
      'description', 'Highly persistent = 4+ months active. Moderately = 2-3 months. Single = 1 month only.'
    ),

    -- ── Top persistent learners (anonymized) ─────────────────────────────────
    'top_persistent', (
      SELECT jsonb_agg(jsonb_build_object(
        'token',         LEFT(learner_token, 8) || '…',
        'site',          site,
        'months_active', months_active,
        'avg_sessions',  avg_sessions_per_month,
        'total_sessions',total_sessions,
        'avg_pue',       avg_pue,
        'certs_earned',  certs_earned
      ))
      FROM (
        SELECT * FROM learner_summary
        ORDER BY months_active DESC, total_sessions DESC
        LIMIT 5
      ) t
    ),

    -- ── Top achievers by completions ─────────────────────────────────────────
    'top_achievers', (
      SELECT jsonb_agg(jsonb_build_object(
        'token',               LEFT(learner_token, 8) || '…',
        'site',                site,
        'activities_completed',activities_completed,
        'certs_earned',        certs_earned,
        'months_active',       months_active,
        'avg_sessions',        avg_sessions_per_month
      ))
      FROM (
        SELECT * FROM learner_summary
        ORDER BY activities_completed DESC
        LIMIT 5
      ) t
    ),

    -- ── Proficiency gainers ───────────────────────────────────────────────────
    'proficiency_gainers', (
      SELECT jsonb_agg(jsonb_build_object(
        'token',        LEFT(learner_token, 8) || '…',
        'site',         site,
        'start_prof',   starting_prof,
        'end_prof',     ending_prof,
        'gain',         prof_gain,
        'months_active',months_active
      ))
      FROM (
        SELECT * FROM learner_summary
        WHERE prof_gain IS NOT NULL
        ORDER BY prof_gain DESC NULLS LAST
        LIMIT 5
      ) t
    ),

    -- ── Monthly cohort trend ─────────────────────────────────────────────────
    'monthly_trend', (
      SELECT jsonb_agg(jsonb_build_object(
        'month',           cohort_month,
        'site',            site,
        'unique_learners', unique_learners,
        'avg_sessions',    avg_sessions,
        'avg_pue',         avg_pue,
        'avg_cognitive',   avg_cognitive,
        'completions',     completions,
        'certs',           certs
      ))
      FROM (SELECT * FROM monthly_cohort ORDER BY cohort_month, site) mc
    ),

    -- ── Scaffolding convergence distribution ─────────────────────────────────
    'scaffold_convergence', (
      SELECT jsonb_build_object(
        'converging', COUNT(*) FILTER (WHERE latest_scaffold_trend = 'converging'),
        'stable',     COUNT(*) FILTER (WHERE latest_scaffold_trend = 'stable'),
        'diverging',  COUNT(*) FILTER (WHERE latest_scaffold_trend = 'diverging'),
        'unknown',    COUNT(*) FILTER (WHERE latest_scaffold_trend IS NULL),
        'description', 'Converging = learner needs less AI help over time (independence growing). Diverging = needs more help. Stable = consistent.'
      )
      FROM learner_summary
    ),

    -- ── Site comparison ──────────────────────────────────────────────────────
    'site_comparison', (
      SELECT jsonb_agg(row_to_json(sc)::jsonb)
      FROM (
        SELECT
          site,
          COUNT(DISTINCT learner_token)                    AS learners,
          ROUND(AVG(months_active)::numeric, 1)            AS avg_months,
          ROUND(AVG(avg_sessions_per_month)::numeric, 1)   AS avg_sessions,
          ROUND(AVG(avg_pue)::numeric, 1)                  AS avg_pue,
          ROUND(AVG(avg_cognitive)::numeric, 1)            AS avg_cognitive,
          SUM(certs_earned)                                AS total_certs
        FROM learner_summary
        GROUP BY site
      ) sc
    ),

    -- ── Data quality notes ───────────────────────────────────────────────────
    'data_notes', jsonb_build_object(
      'k_anon_threshold',       K_MIN,
      'ai_prof_available',      (SELECT COUNT(*) FROM learner_summary WHERE starting_prof IS NOT NULL) > 0,
      'pue_available',          (SELECT COUNT(*) FROM learner_summary WHERE avg_pue IS NOT NULL) > 0,
      'earliest_data',          (SELECT MIN(first_month) FROM learner_summary),
      'latest_data',            (SELECT MAX(last_month)  FROM learner_summary),
      'possible_admin_accounts',(SELECT COUNT(*) FROM learner_summary WHERE possible_admin_account = true),
      'null_session_learners',  (SELECT COUNT(*) FROM learner_summary WHERE total_sessions = 0),
      'ghost_records',          (SELECT COUNT(*) FROM learner_summary WHERE avg_pue IS NULL AND avg_cognitive IS NULL),
      'note', 'AI proficiency scores (0-3 scale) may be null for learners who have not completed a formal assessment. PUE scores are 0-100 scale. Learners with zero sessions but high PUE/cognitive scores may be teacher or site_leader accounts. Ghost records have no assessment data at all.'
    )

  ) INTO v_result;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_longitudinal_summary"("p_site" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_profile"() RETURNS TABLE("role" "text", "organization_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role::text, organization_id
  FROM profiles
  WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_research_snapshot"("p_site" "text" DEFAULT NULL::"text", "p_from_month" "text" DEFAULT NULL::"text", "p_to_month" "text" DEFAULT NULL::"text") RETURNS TABLE("learner_token" "text", "site" "text", "cohort_month" "date", "grade_band" "text", "assessment_cycle" integer, "is_persistent_learner" boolean, "mentor_present" boolean, "session_count" integer, "engaged_session_count" integer, "avg_words_per_session" numeric, "activities_started_total" integer, "activities_completed_total" integer, "activities_started_today" integer, "activities_completed_today" integer, "certifications_earned_today" integer, "certifications_earned_total" integer, "cert_names_passed" "text"[], "k_anon_suppressed" boolean, "ai_prof_application_score" numeric, "ai_prof_ethics_score" numeric, "ai_prof_understanding_score" numeric, "ai_prof_verification_score" numeric, "ai_prof_min_score" numeric, "ai_prof_cert_level" "text", "cognitive_score" numeric, "critical_thinking_score" numeric, "problem_solving_score" numeric, "creativity_score" numeric, "reasoning_level_0" numeric, "reasoning_level_1" numeric, "reasoning_level_2" numeric, "reasoning_level_3" numeric, "reasoning_chain_count" integer, "metacog_verification_rate" numeric, "metacog_reactive_rate" numeric, "metacog_strategic_rate" numeric, "scaffold_convergence_trend" "text", "scaffold_clarification_per_session" numeric, "scaffold_decomposition_per_session" numeric, "scaffold_consecutive_correction_runs" numeric, "pue_score" numeric, "pue_energy_constraint_pct" numeric, "pue_market_pricing_pct" numeric, "pue_enterprise_planning_pct" numeric, "pue_learner_initiated_pct" numeric, "pue_multi_domain_pct" numeric, "pue_local_context_pct" numeric, "role_readiness_signal" integer, "role_teaching_intent_count" integer, "role_community_application_count" integer, "role_enterprise_orientation_count" integer, "role_intergenerational_count" integer, "peer_diffusion_signal" integer, "cert_attempted_count" integer, "cert_passed_count" integer, "cert_avg_score" numeric, "ci_tracks_active_count" integer, "ci_certs_passed_count" integer, "artifact_quality_score" numeric, "artifact_produced" boolean, "artifact_goal_specificity" numeric, "artifact_resource_spec" numeric, "artifact_implementation_steps" numeric, "artifact_constraint_integration" numeric, "artifact_quantitative_reasoning" numeric, "artifact_feasibility" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  WITH
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
    LEFT JOIN learner_history lh
      ON  ds.learner_token = lh.learner_token
      AND ds.cohort_month  = lh.cohort_month
    WHERE
      (p_site       IS NULL OR ds.site          =  p_site)
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
$$;


ALTER FUNCTION "public"."get_research_snapshot"("p_site" "text", "p_from_month" "text", "p_to_month" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."dashboard_stats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "snapshot_date" "date" NOT NULL,
    "activity_date" "date" NOT NULL,
    "cohort_month" "date" NOT NULL,
    "site" "text" NOT NULL,
    "learner_token" "text" NOT NULL,
    "grade_band" "text",
    "activities_started_today" integer DEFAULT 0 NOT NULL,
    "activities_completed_today" integer DEFAULT 0 NOT NULL,
    "categories_active_today" "text"[],
    "certifications_earned_today" integer DEFAULT 0 NOT NULL,
    "activities_started_total" integer DEFAULT 0 NOT NULL,
    "activities_completed_total" integer DEFAULT 0 NOT NULL,
    "certifications_earned_total" integer DEFAULT 0 NOT NULL,
    "categories_ever_active" "text"[],
    "session_count" integer,
    "engaged_session_count" integer,
    "avg_words_per_session" numeric(6,1),
    "ai_prof_application_score" numeric(5,2),
    "ai_prof_ethics_score" numeric(5,2),
    "ai_prof_understanding_score" numeric(5,2),
    "ai_prof_verification_score" numeric(5,2),
    "ai_prof_min_score" numeric(5,2),
    "ai_prof_cert_level" "text",
    "cognitive_score" numeric(5,2),
    "critical_thinking_score" numeric(5,2),
    "problem_solving_score" numeric(5,2),
    "creativity_score" numeric(5,2),
    "scaffold_convergence_trend" "text",
    "scaffold_clarification_per_session" numeric(6,2),
    "scaffold_decomposition_per_session" numeric(6,2),
    "scaffold_consecutive_correction_runs" numeric(6,2),
    "reasoning_level_0" numeric,
    "reasoning_level_1" numeric,
    "reasoning_level_2" numeric,
    "reasoning_level_3" numeric,
    "reasoning_chain_count" integer,
    "metacog_verification_rate" numeric(6,2),
    "metacog_reactive_rate" numeric(6,2),
    "metacog_strategic_rate" numeric(6,2),
    "pue_score" numeric(5,2),
    "pue_energy_constraint_pct" numeric(5,1),
    "pue_market_pricing_pct" numeric(5,1),
    "pue_enterprise_planning_pct" numeric(5,1),
    "pue_learner_initiated_pct" numeric(5,1),
    "pue_multi_domain_pct" numeric(5,1),
    "pue_local_context_pct" numeric(5,1),
    "role_readiness_signal" integer,
    "role_teaching_intent_count" integer,
    "role_community_application_count" integer,
    "role_enterprise_orientation_count" integer,
    "role_intergenerational_count" integer,
    "peer_diffusion_signal" integer,
    "cert_attempted_count" integer,
    "cert_passed_count" integer,
    "cert_avg_score" numeric(4,2),
    "cert_names_passed" "text"[],
    "ci_tracks_active_count" integer,
    "ci_certs_passed_count" integer,
    "k_anon_suppressed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "artifact_quality_score" numeric(4,2),
    "artifact_produced" boolean,
    "is_persistent_learner" boolean,
    "artifact_goal_specificity" numeric(3,2),
    "artifact_resource_spec" numeric(3,2),
    "artifact_implementation_steps" numeric(3,2),
    "artifact_constraint_integration" numeric(3,2),
    "artifact_quantitative_reasoning" numeric(3,2),
    "artifact_feasibility" numeric(3,2)
);


ALTER TABLE "public"."dashboard_stats" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."research_data_view" AS
 WITH "daily_cohort_counts" AS (
         SELECT "dashboard_stats"."site",
            "dashboard_stats"."activity_date",
            "count"(DISTINCT "dashboard_stats"."learner_token") AS "cohort_size"
           FROM "public"."dashboard_stats"
          WHERE ("dashboard_stats"."k_anon_suppressed" = false)
          GROUP BY "dashboard_stats"."site", "dashboard_stats"."activity_date"
        )
 SELECT "ds"."id",
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
    "dcc"."cohort_size"
   FROM ("public"."dashboard_stats" "ds"
     JOIN "daily_cohort_counts" "dcc" ON ((("dcc"."site" = "ds"."site") AND ("dcc"."activity_date" = "ds"."activity_date"))))
  WHERE (("ds"."k_anon_suppressed" = false) AND ("dcc"."cohort_size" >= 5));


ALTER TABLE "public"."research_data_view" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_research_snapshot"("p_site" "text" DEFAULT NULL::"text", "p_from_date" "date" DEFAULT NULL::"date", "p_to_date" "date" DEFAULT NULL::"date", "p_granularity" "text" DEFAULT 'daily'::"text") RETURNS SETOF "public"."research_data_view"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('research_lead', 'platform_administrator', 'site_leader')
  ) THEN
    RAISE EXCEPTION 'Access denied: research role required';
  END IF;

  IF p_granularity = 'monthly' THEN
    RETURN QUERY
    SELECT DISTINCT ON (rdv.learner_token, rdv.cohort_month, rdv.site) rdv.*
    FROM research_data_view rdv
    WHERE (p_site IS NULL OR rdv.site = p_site)
      AND (p_from_date IS NULL OR rdv.activity_date >= p_from_date)
      AND (p_to_date   IS NULL OR rdv.activity_date <= p_to_date)
    ORDER BY rdv.learner_token, rdv.cohort_month, rdv.site, rdv.activity_date DESC;
  ELSE
    RETURN QUERY
    SELECT rdv.*
    FROM research_data_view rdv
    WHERE (p_site IS NULL OR rdv.site = p_site)
      AND (p_from_date IS NULL OR rdv.activity_date >= p_from_date)
      AND (p_to_date   IS NULL OR rdv.activity_date <= p_to_date)
    ORDER BY rdv.activity_date DESC, rdv.site, rdv.learner_token;
  END IF;
END;
$$;


ALTER FUNCTION "public"."get_research_snapshot"("p_site" "text", "p_from_date" "date", "p_to_date" "date", "p_granularity" "text") OWNER TO "postgres";


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
        ORDER BY learner_token, cohort_month, snapshot_date DESC
      ) deduped
    ) with_cumulative
  ) bucketed
  WHERE session_band IS NOT NULL
  GROUP BY session_band, band_midpoint
  ORDER BY band_midpoint;
$$;


ALTER FUNCTION "public"."get_session_band_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."grade_band"("p_grade" integer) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN p_grade BETWEEN 1 AND 4  THEN '1-4'
    WHEN p_grade BETWEEN 5 AND 8  THEN '5-8'
    WHEN p_grade BETWEEN 9 AND 12 THEN '9-12'
    ELSE NULL
  END;
$$;


ALTER FUNCTION "public"."grade_band"("p_grade" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."learner_token"("p_user_id" "uuid") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT md5(p_user_id::text || 'vai-research-salt-2025');
$$;


ALTER FUNCTION "public"."learner_token"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_contribution_summary"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO researcher_contribution_summary (
    user_id, project_id, phase_id, site,
    findings_submitted, interviews_conducted, surveys_administered,
    observations_logged, reflexivity_entries, peer_reviews_given,
    ai_sessions_completed, draft_texts_used, portfolio_items_added,
    total_contribution_score, last_updated
  )
  SELECT
    NEW.user_id, NEW.project_id, NEW.phase_id, NEW.site,
    COUNT(*) FILTER (WHERE contribution_type = 'finding_submitted'),
    COUNT(*) FILTER (WHERE contribution_type = 'interview_conducted'),
    COUNT(*) FILTER (WHERE contribution_type = 'survey_administered'),
    COUNT(*) FILTER (WHERE contribution_type = 'observation_logged'),
    COUNT(*) FILTER (WHERE contribution_type = 'reflexivity_entry'),
    COUNT(*) FILTER (WHERE contribution_type = 'peer_review_given'),
    COUNT(*) FILTER (WHERE contribution_type = 'ai_session_completed'),
    COUNT(*) FILTER (WHERE contribution_type = 'draft_text_used'),
    COUNT(*) FILTER (WHERE contribution_type = 'portfolio_item_added'),
    SUM(weight),
    NOW()
  FROM researcher_contributions
  WHERE user_id = NEW.user_id AND phase_id = NEW.phase_id
  ON CONFLICT (user_id, phase_id) DO UPDATE SET
    findings_submitted      = EXCLUDED.findings_submitted,
    interviews_conducted    = EXCLUDED.interviews_conducted,
    surveys_administered    = EXCLUDED.surveys_administered,
    observations_logged     = EXCLUDED.observations_logged,
    reflexivity_entries     = EXCLUDED.reflexivity_entries,
    peer_reviews_given      = EXCLUDED.peer_reviews_given,
    ai_sessions_completed   = EXCLUDED.ai_sessions_completed,
    draft_texts_used        = EXCLUDED.draft_texts_used,
    portfolio_items_added   = EXCLUDED.portfolio_items_added,
    total_contribution_score = EXCLUDED.total_contribution_score,
    last_updated            = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."refresh_contribution_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_dashboard"("user_id_param" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  user_grade     integer;
  user_continent text;
BEGIN
  SELECT grade_level, continent
    INTO user_grade, user_continent
  FROM profiles
  WHERE id = user_id_param;

  IF user_grade IS NULL THEN
    user_grade := 3;
  END IF;
  IF user_continent IS NULL OR trim(user_continent) = '' THEN
    user_continent := 'North America';
  END IF;

  -- Update existing
  UPDATE dashboard d
  SET
    sub_category = lm.sub_category,
    grade_level  = lm.grade_level,
    continent    = lm.continent,
    updated_at   = NOW()
  FROM learning_modules lm
  WHERE d.learning_module_id = lm.learning_module_id
    AND d.user_id = user_id_param;

  -- Insert missing
  INSERT INTO dashboard (
    user_id,
    learning_module_id,
    activity,
    title,
    category_activity,
    sub_category,
    grade_level,
    continent,
    progress,
    created_at,
    updated_at
  )
  SELECT
    user_id_param,
    lm.learning_module_id,
    lm.title,
    lm.title,
    lm.category,
    lm.sub_category,
    lm.grade_level,
    lm.continent,
    'not started',
    NOW(),
    NOW()
  FROM learning_modules lm
  WHERE lm.continent = user_continent
    AND lm.public = 1                         -- ← integer compare
    AND (lm.grade_level = user_grade OR lm.grade_level = 4)
    AND NOT EXISTS (
      SELECT 1
      FROM dashboard d2
      WHERE d2.user_id = user_id_param
        AND d2.learning_module_id = lm.learning_module_id
    );

  RAISE NOTICE 
    'Refreshed dashboard for user % (continent=% , grade=%)', 
    user_id_param, user_continent, user_grade;
END;
$$;


ALTER FUNCTION "public"."refresh_dashboard"("user_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_user_dashboard"("user_id_param" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$DECLARE
    user_grade INTEGER;
BEGIN
    -- Get user's grade level
    SELECT grade_level INTO user_grade 
    FROM profiles 
    WHERE id = user_id_param;
    
    -- Default to grade 3 if not set
    IF user_grade IS NULL THEN
        user_grade := 3;
    END IF;
    
    -- Update existing dashboard records that might be missing sub_category
    UPDATE dashboard 
    SET sub_category = learning_modules.sub_category,
        grade_level = learning_modules.grade_level,
        country = learning_modules.country,
        updated_at = NOW()
    FROM learning_modules 
    WHERE dashboard.learning_module_id = learning_modules.learning_module_id
    AND dashboard.user_id = user_id_param;
    
    -- Insert any missing dashboard activities for user's grade AND grade 4
    INSERT INTO dashboard (
        user_id, 
        learning_module_id,
        activity, 
        title,
        category_activity,
        sub_category,
        grade_level,
        continent,
        country,
        progress, 
        created_at, 
        updated_at
    )
    SELECT 
        user_id_param,
        lm.learning_module_id,
        lm.title,
        lm.title,
        lm.category,
        lm.sub_category,
        lm.grade_level,
        lm.continent,
        lm.country,
        'not started',
        NOW(),
        NOW()
    FROM learning_modules lm
    WHERE lm.country = 'US'
    AND lm.public = 1
    AND (
        lm.grade_level = user_grade
        OR lm.grade_level = 4
    )
    AND NOT EXISTS (
        SELECT 1 FROM dashboard d 
        WHERE d.user_id = user_id_param 
        AND d.learning_module_id = lm.learning_module_id
    );
    
    RAISE NOTICE 'Refreshed dashboard for user % with grade level % + grade 4', user_id_param, user_grade;
END;$$;


ALTER FUNCTION "public"."refresh_user_dashboard"("user_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_site"("p_city" "text", "p_country" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  v_city    text := LOWER(TRIM(COALESCE(p_city, '')));
  v_country text := LOWER(TRIM(COALESCE(p_country, '')));
BEGIN
  -- ── Exclude US entirely ───────────────────────────────────────────────────
  IF v_country IN ('united states', 'us', 'usa', 'u.s.', 'u.s.a.', 'america') THEN
    RETURN NULL;
  END IF;

  -- ── Exclude known US cities (even without country) ────────────────────────
  IF v_city IN (
    'dayton', 'cincinnati', 'columbus', 'cleveland', 'toledo', 'akron',
    'beavercreek', 'xenia', 'springfield', 'kettering', 'fairborn',
    'new york', 'los angeles', 'chicago', 'houston', 'phoenix',
    'philadelphia', 'san antonio', 'san diego', 'dallas', 'san jose',
    'austin', 'jacksonville', 'fort worth', 'charlotte', 'seattle',
    'denver', 'boston', 'nashville', 'baltimore', 'miami', 'atlanta',
    'portland', 'las vegas', 'memphis', 'louisville', 'milwaukee',
    'albuquerque', 'tucson', 'fresno', 'sacramento', 'mesa',
    'kansas city', 'omaha', 'raleigh', 'minneapolis'
  ) THEN
    RETURN NULL;
  END IF;

  -- ── African cities → canonical site names ─────────────────────────────────
  IF p_city IS NOT NULL AND v_city != '' THEN
    CASE v_city
      WHEN 'oloibiri'      THEN RETURN 'Oloibiri';
      WHEN 'olobiri'       THEN RETURN 'Oloibiri';
      WHEN 'oloibir'       THEN RETURN 'Oloibiri';
      WHEN 'ibiade'        THEN RETURN 'Ibiade';
      WHEN 'lagos'         THEN RETURN 'Lagos';
      WHEN 'accra'         THEN RETURN 'Accra';
      WHEN 'kigali'        THEN RETURN 'Kigali';
      WHEN 'yenagoa'       THEN RETURN 'Oloibiri';
      WHEN 'ogbia town'    THEN RETURN 'Oloibiri';
      WHEN 'abuja'         THEN RETURN 'Abuja';
      WHEN 'port harcourt' THEN RETURN 'Port Harcourt';
      WHEN 'nairobi'       THEN RETURN 'Nairobi';
      WHEN 'kampala'       THEN RETURN 'Kampala';
      WHEN 'dar es salaam' THEN RETURN 'Dar es Salaam';
      WHEN 'addis ababa'   THEN RETURN 'Addis Ababa';
      WHEN 'dakar'         THEN RETURN 'Dakar';
      WHEN 'lusaka'        THEN RETURN 'Lusaka';
      WHEN 'harare'        THEN RETURN 'Harare';
      WHEN 'cairo'         THEN RETURN 'Cairo';
      ELSE RETURN INITCAP(TRIM(p_city));
    END CASE;
  END IF;

  -- ── African country fallback ───────────────────────────────────────────────
  CASE v_country
    WHEN 'nigeria'       THEN RETURN 'Nigeria';
    WHEN 'ghana'         THEN RETURN 'Ghana';
    WHEN 'kenya'         THEN RETURN 'Kenya';
    WHEN 'rwanda'        THEN RETURN 'Rwanda';
    WHEN 'tanzania'      THEN RETURN 'Tanzania';
    WHEN 'uganda'        THEN RETURN 'Uganda';
    WHEN 'angola'        THEN RETURN 'Angola';
    WHEN 'ethiopia'      THEN RETURN 'Ethiopia';
    WHEN 'senegal'       THEN RETURN 'Senegal';
    WHEN 'cameroon'      THEN RETURN 'Cameroon';
    WHEN 'zambia'        THEN RETURN 'Zambia';
    WHEN 'zimbabwe'      THEN RETURN 'Zimbabwe';
    WHEN 'mozambique'    THEN RETURN 'Mozambique';
    WHEN 'ivory coast'   THEN RETURN 'Ivory Coast';
    WHEN 'south africa'  THEN RETURN 'South Africa';
    ELSE RETURN NULL;   -- Unknown or non-African → exclude from research cohort
  END CASE;
END;
$$;


ALTER FUNCTION "public"."resolve_site"("p_city" "text", "p_country" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_org_leader_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.leader_id IS NULL THEN
    NEW.leader_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_org_leader_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_team_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Only generate a code if one wasn't provided
    IF NEW.team_code IS NULL THEN
        NEW.team_code := generate_team_code();
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_team_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_team_name"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.team_name IS NULL THEN
    NEW.team_name := NEW.site || ' Team ' || TO_CHAR(NOW(), 'MMYYYY');
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_team_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."show_current_user"() RETURNS "text"
    LANGUAGE "sql"
    AS $$
  select current_user;
$$;


ALTER FUNCTION "public"."show_current_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tier_rank"("tier" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
    SELECT CASE tier
      WHEN 'multiplier' THEN 5
      WHEN 'builder'    THEN 4
      WHEN 'bridge'     THEN 3
      WHEN 'scout'      THEN 2
      WHEN 'seed'       THEN 1
      ELSE 0
    END;
  $$;


ALTER FUNCTION "public"."tier_rank"("tier" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_agc_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  IF NEW.resolved = TRUE AND OLD.resolved = FALSE THEN NEW.resolved_at = NOW(); END IF;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."update_agc_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_agf_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;


ALTER FUNCTION "public"."update_agf_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_ahc_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  -- Auto-stamp resolved_at when case is marked resolved
  IF NEW.resolved = TRUE AND OLD.resolved = FALSE THEN
    NEW.resolved_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_ahc_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_ahf_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_ahf_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_ec_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."update_ec_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_econ_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."update_econ_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_fc_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;


ALTER FUNCTION "public"."update_fc_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_fcon_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  IF NEW.resolved = TRUE AND OLD.resolved = FALSE THEN NEW.resolved_at = NOW(); END IF;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."update_fcon_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_ha_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  IF NEW.resolved = TRUE AND OLD.resolved = FALSE THEN NEW.resolved_at = NOW(); END IF;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."update_ha_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_hp_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;


ALTER FUNCTION "public"."update_hp_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_grand"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."update_updated_at_grand"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agent_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "provider_used" "text",
    "tokens_used" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."agent_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "system_prompt" "text" NOT NULL,
    "model_pref" "text" DEFAULT 'auto'::"text" NOT NULL,
    "is_shared" boolean DEFAULT false NOT NULL,
    "share_token" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agents_description_check" CHECK (("char_length"("description") <= 300)),
    CONSTRAINT "agents_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 80))),
    CONSTRAINT "agents_system_prompt_check" CHECK ((("char_length"("system_prompt") >= 10) AND ("char_length"("system_prompt") <= 4000)))
);


ALTER TABLE "public"."agents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agriculture_consultations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "youth_user_id" "uuid" NOT NULL,
    "farmer_id" "uuid" NOT NULL,
    "consultation_type" "text" NOT NULL,
    "problem_summary" "text" NOT NULL,
    "ai_advice" "text",
    "urgency_level" "text",
    "youth_actions_taken" "text",
    "conversation_history" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "follow_up_needed" boolean DEFAULT false NOT NULL,
    "follow_up_date" "date",
    "follow_up_notes" "text",
    "resolved" boolean DEFAULT false NOT NULL,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolution_outcome" "text",
    "resolution_narrative" "text",
    "resolution_value_amount" numeric,
    "resolution_value_unit" "text",
    "resolution_value_label" "text",
    CONSTRAINT "agriculture_consultations_consultation_type_check" CHECK (("consultation_type" = ANY (ARRAY['crop-problem'::"text", 'yield-improvement'::"text", 'market-strategy'::"text", 'oil-contamination'::"text", 'climate-adaptation'::"text", 'crop-disease'::"text", 'pest-damage'::"text", 'soil-water'::"text", 'post-harvest'::"text", 'market-input'::"text"]))),
    CONSTRAINT "agriculture_consultations_resolution_outcome_check" CHECK (("resolution_outcome" = ANY (ARRAY['applied'::"text", 'partially_applied'::"text", 'not_applied'::"text"]))),
    CONSTRAINT "agriculture_consultations_resolution_value_unit_check" CHECK (("resolution_value_unit" = ANY (ARRAY['NGN'::"text", 'kg'::"text", 'days_averted'::"text", 'animals_saved'::"text", 'other'::"text"]))),
    CONSTRAINT "agriculture_consultations_urgency_level_check" CHECK (("urgency_level" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'urgent'::"text"])))
);


ALTER TABLE "public"."agriculture_consultations" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."agriculture_farmer_summary" AS
SELECT
    NULL::"uuid" AS "id",
    NULL::"uuid" AS "youth_user_id",
    NULL::"text" AS "farmer_name",
    NULL::"text" AS "village",
    NULL::"text" AS "phone",
    NULL::"jsonb" AS "crops",
    NULL::"text" AS "notes",
    NULL::timestamp with time zone AS "created_at",
    NULL::timestamp with time zone AS "updated_at",
    NULL::bigint AS "total_consultations",
    NULL::bigint AS "open_cases",
    NULL::timestamp with time zone AS "last_consultation_at";


ALTER TABLE "public"."agriculture_farmer_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agriculture_farmers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "youth_user_id" "uuid" NOT NULL,
    "farmer_name" "text" NOT NULL,
    "village" "text" NOT NULL,
    "phone" "text",
    "crops" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agriculture_farmers" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."agriculture_open_followups" AS
 SELECT "c"."id",
    "c"."youth_user_id",
    "f"."farmer_name",
    "f"."village",
    "c"."consultation_type",
    "c"."urgency_level",
    "c"."follow_up_date",
    "c"."follow_up_notes",
    "c"."created_at" AS "consultation_date"
   FROM ("public"."agriculture_consultations" "c"
     JOIN "public"."agriculture_farmers" "f" ON (("f"."id" = "c"."farmer_id")))
  WHERE (("c"."follow_up_needed" = true) AND ("c"."resolved" = false))
  ORDER BY "c"."follow_up_date";


ALTER TABLE "public"."agriculture_open_followups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_playground_chats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" DEFAULT 'New Chat'::"text" NOT NULL,
    "messages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "model" "text"
);


ALTER TABLE "public"."ai_playground_chats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."animal_husbandry_consultations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "youth_user_id" "uuid" NOT NULL,
    "farmer_id" "uuid" NOT NULL,
    "species" "text" NOT NULL,
    "symptom_summary" "text" NOT NULL,
    "animals_affected" integer,
    "animals_total" integer,
    "ai_diagnosis" "text",
    "urgency_level" "text",
    "farmer_actions_recommended" "text",
    "youth_actions_taken" "text",
    "conversation_history" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "follow_up_needed" boolean DEFAULT false NOT NULL,
    "follow_up_date" "date",
    "follow_up_notes" "text",
    "resolved" boolean DEFAULT false NOT NULL,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "raw_offline_payload" "jsonb",
    "resolution_outcome" "text",
    "resolution_narrative" "text",
    "resolution_value_amount" numeric,
    "resolution_value_unit" "text",
    "resolution_value_label" "text",
    CONSTRAINT "animal_husbandry_consultations_resolution_outcome_check" CHECK (("resolution_outcome" = ANY (ARRAY['applied'::"text", 'partially_applied'::"text", 'not_applied'::"text"]))),
    CONSTRAINT "animal_husbandry_consultations_resolution_value_unit_check" CHECK (("resolution_value_unit" = ANY (ARRAY['NGN'::"text", 'kg'::"text", 'days_averted'::"text", 'animals_saved'::"text", 'other'::"text"]))),
    CONSTRAINT "animal_husbandry_consultations_species_check" CHECK (("species" = ANY (ARRAY['poultry'::"text", 'goats_sheep'::"text", 'cattle'::"text", 'pigs'::"text"]))),
    CONSTRAINT "animal_husbandry_consultations_urgency_level_check" CHECK (("urgency_level" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'emergency'::"text"])))
);


ALTER TABLE "public"."animal_husbandry_consultations" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."animal_husbandry_farmer_summary" AS
SELECT
    NULL::"uuid" AS "id",
    NULL::"uuid" AS "youth_user_id",
    NULL::"text" AS "farmer_name",
    NULL::"text" AS "village",
    NULL::"text" AS "phone",
    NULL::"jsonb" AS "animals",
    NULL::"text" AS "notes",
    NULL::timestamp with time zone AS "created_at",
    NULL::timestamp with time zone AS "updated_at",
    NULL::bigint AS "total_consultations",
    NULL::bigint AS "open_cases",
    NULL::bigint AS "emergency_count",
    NULL::timestamp with time zone AS "last_consultation_at";


ALTER TABLE "public"."animal_husbandry_farmer_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."animal_husbandry_farmers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "youth_user_id" "uuid" NOT NULL,
    "farmer_name" "text" NOT NULL,
    "village" "text" NOT NULL,
    "phone" "text",
    "animals" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."animal_husbandry_farmers" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."animal_husbandry_open_followups" AS
 SELECT "c"."id",
    "c"."youth_user_id",
    "f"."farmer_name",
    "f"."village",
    "c"."species",
    "c"."urgency_level",
    "c"."follow_up_date",
    "c"."follow_up_notes",
    "c"."created_at" AS "consultation_date"
   FROM ("public"."animal_husbandry_consultations" "c"
     JOIN "public"."animal_husbandry_farmers" "f" ON (("f"."id" = "c"."farmer_id")))
  WHERE (("c"."follow_up_needed" = true) AND ("c"."resolved" = false))
  ORDER BY "c"."follow_up_date";


ALTER TABLE "public"."animal_husbandry_open_followups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_cost_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "logged_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "page" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "input_tokens" integer DEFAULT 0 NOT NULL,
    "output_tokens" integer DEFAULT 0 NOT NULL,
    "cache_hit_tokens" integer DEFAULT 0 NOT NULL,
    "cache_write_tokens" integer DEFAULT 0 NOT NULL,
    "estimated_cost_usd" numeric(10,6) DEFAULT 0 NOT NULL,
    "user_id" "text",
    "city" "text",
    "action" "text" DEFAULT 'generate'::"text",
    "cohort" "text"
);


ALTER TABLE "public"."api_cost_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."api_cost_log" IS 'Per-request API cost tracking for Anthropic and Groq calls routed through chat.js';



CREATE TABLE IF NOT EXISTS "public"."assessments_monthly_global" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "organization_id" "uuid",
    "continent" "text",
    "learner_count" integer NOT NULL,
    "assessed_count" integer NOT NULL,
    "cognitive_mean" numeric(5,2),
    "critical_thinking_mean" numeric(5,2),
    "problem_solving_mean" numeric(5,2),
    "creativity_mean" numeric(5,2),
    "pue_mean" numeric(5,2),
    "cognitive_dist" "jsonb",
    "critical_thinking_dist" "jsonb",
    "problem_solving_dist" "jsonb",
    "creativity_dist" "jsonb",
    "pue_dist" "jsonb",
    "cognitive_delta" numeric(5,2),
    "critical_thinking_delta" numeric(5,2),
    "problem_solving_delta" numeric(5,2),
    "creativity_delta" numeric(5,2),
    "pue_delta" numeric(5,2),
    "assessment_model" "text" DEFAULT 'gpt-4o'::"text",
    "generated_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text",
    "period_label" "text",
    "sessions_count" integer,
    "avg_mean" numeric(5,2),
    "avg_delta" numeric(5,2),
    "ai_prof_application_mean" numeric(5,2),
    "ai_prof_ethics_mean" numeric(5,2),
    "ai_prof_understanding_mean" numeric(5,2),
    "ai_prof_verification_mean" numeric(5,2),
    "pue_learner_pct" numeric(5,2),
    "learner_initiated_pct" numeric(5,2),
    "energy_constraint_pct" numeric(5,2),
    "market_pricing_pct" numeric(5,2),
    "enterprise_planning_pct" numeric(5,2),
    "multi_domain_pct" numeric(5,2),
    "local_context_pct" numeric(5,2),
    "ai_introduced_pct" numeric(5,2),
    "role_ready_count" integer,
    "converging_count" integer,
    "structured_l3_pct" numeric(5,2),
    "certs_total" integer,
    "organization_name" "text"
);


ALTER TABLE "public"."assessments_monthly_global" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."certification_assessments" (
    "certification_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "certification_name" "text" NOT NULL,
    "assessment_name" "text" NOT NULL,
    "assessment_order" integer NOT NULL,
    "certification_prompt" "text" NOT NULL,
    "certification_level0_metric" "text" NOT NULL,
    "certification_level1_metric" "text" NOT NULL,
    "certification_level2_metric" "text" NOT NULL,
    "certification_level3_metric" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text",
    "phase" integer
);


ALTER TABLE "public"."certification_assessments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."challenge_enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "learner_id" "uuid" NOT NULL,
    "challenge_id" "uuid" NOT NULL,
    "org_id" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "checked_out_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_at" timestamp with time zone,
    "awarded_at" timestamp with time zone,
    "action_taken" "text",
    "impact_observed" "text",
    "extra_detail" "text",
    "community_member_role" "text",
    "brought_person" boolean DEFAULT false,
    "referral_enrollee_id" "uuid",
    "tier_awarded" "text",
    "impact_evaluation" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "challenge_enrollments_community_member_role_check" CHECK (("community_member_role" = ANY (ARRAY['farmer'::"text", 'fisher'::"text", 'entrepreneur'::"text", 'family'::"text", 'health'::"text", 'animal-keeper'::"text", 'other'::"text"]))),
    CONSTRAINT "challenge_enrollments_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'submitted'::"text", 'awarded'::"text", 'expired'::"text"]))),
    CONSTRAINT "challenge_enrollments_tier_awarded_check" CHECK (("tier_awarded" = ANY (ARRAY['seed'::"text", 'scout'::"text", 'bridge'::"text", 'builder'::"text", 'multiplier'::"text"])))
);


ALTER TABLE "public"."challenge_enrollments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_challenges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "text" NOT NULL,
    "week_start" "date" NOT NULL,
    "week_end" "date" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "community_impact_slug" "text" NOT NULL,
    "tier_target" "text" NOT NULL,
    "challenge_mode_intro" "text" NOT NULL,
    "challenge_instruction" "text" NOT NULL,
    "return_question_1" "text" NOT NULL,
    "return_question_2" "text" NOT NULL,
    "return_question_3" "text",
    "community_role" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "winner_name" "text",
    "winner_id" "uuid",
    "winner_reason" "text",
    "winner_tier" "text",
    CONSTRAINT "community_challenges_community_impact_slug_check" CHECK (("community_impact_slug" = ANY (ARRAY['ai-ambassadors'::"text", 'agriculture'::"text", 'fishing'::"text", 'healthcare'::"text", 'entrepreneurship'::"text", 'animal-husbandry'::"text"]))),
    CONSTRAINT "community_challenges_community_role_check" CHECK (("community_role" = ANY (ARRAY['farmer'::"text", 'fisher'::"text", 'entrepreneur'::"text", 'family'::"text", 'health'::"text", 'animal-keeper'::"text", 'general'::"text"]))),
    CONSTRAINT "community_challenges_tier_target_check" CHECK (("tier_target" = ANY (ARRAY['seed'::"text", 'scout'::"text", 'bridge'::"text", 'builder'::"text", 'multiplier'::"text"])))
);


ALTER TABLE "public"."community_challenges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_impact_journal" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "learner_id" "uuid" NOT NULL,
    "org_id" "text" NOT NULL,
    "enrollment_id" "uuid",
    "challenge_id" "uuid",
    "community_member_name" "text",
    "community_member_role" "text" NOT NULL,
    "community_impact_slug" "text" NOT NULL,
    "visit_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "situation_before" "text" NOT NULL,
    "action_taken" "text" NOT NULL,
    "change_observed" "text" NOT NULL,
    "follow_up_needed" "text",
    "photo_urls" "text"[],
    "ai_summary" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "community_impact_journal_community_impact_slug_check" CHECK (("community_impact_slug" = ANY (ARRAY['ai-ambassadors'::"text", 'agriculture'::"text", 'fishing'::"text", 'healthcare'::"text", 'entrepreneurship'::"text", 'animal-husbandry'::"text"]))),
    CONSTRAINT "community_impact_journal_community_member_role_check" CHECK (("community_member_role" = ANY (ARRAY['farmer'::"text", 'fisher'::"text", 'entrepreneur'::"text", 'family'::"text", 'health'::"text", 'animal-keeper'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."community_impact_journal" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entrepreneurship_consultations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "youth_user_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "consultation_type" "text" NOT NULL,
    "problem_summary" "text" DEFAULT ''::"text" NOT NULL,
    "ai_advice" "text",
    "urgency_level" "text",
    "youth_actions_taken" "text",
    "conversation_history" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "follow_up_needed" boolean DEFAULT false NOT NULL,
    "follow_up_date" "date",
    "follow_up_notes" "text",
    "resolved" boolean DEFAULT false NOT NULL,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolution_outcome" "text",
    "resolution_narrative" "text",
    "resolution_value_amount" numeric,
    "resolution_value_unit" "text",
    "resolution_value_label" "text",
    CONSTRAINT "entrepreneurship_consultations_resolution_outcome_check" CHECK (("resolution_outcome" = ANY (ARRAY['applied'::"text", 'partially_applied'::"text", 'not_applied'::"text"]))),
    CONSTRAINT "entrepreneurship_consultations_resolution_value_unit_check" CHECK (("resolution_value_unit" = ANY (ARRAY['NGN'::"text", 'kg'::"text", 'days_averted'::"text", 'animals_saved'::"text", 'other'::"text"]))),
    CONSTRAINT "entrepreneurship_consultations_type_check" CHECK (("consultation_type" = ANY (ARRAY['starting-up'::"text", 'business-planning'::"text", 'pricing-finance'::"text", 'marketing-sales'::"text", 'fixing-problems'::"text", 'growing-scaling'::"text"]))),
    CONSTRAINT "entrepreneurship_consultations_urgency_check" CHECK ((("urgency_level" IS NULL) OR ("urgency_level" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'urgent'::"text"]))))
);


ALTER TABLE "public"."entrepreneurship_consultations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fishing_consultations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "youth_user_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "consultation_type" "text" NOT NULL,
    "problem_summary" "text" NOT NULL,
    "ai_advice" "text",
    "urgency_level" "text",
    "youth_actions_taken" "text",
    "conversation_history" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "follow_up_needed" boolean DEFAULT false NOT NULL,
    "follow_up_date" "date",
    "follow_up_notes" "text",
    "resolved" boolean DEFAULT false NOT NULL,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolution_outcome" "text",
    "resolution_narrative" "text",
    "resolution_value_amount" numeric,
    "resolution_value_unit" "text",
    "resolution_value_label" "text",
    CONSTRAINT "fishing_consultations_consultation_type_check" CHECK (("consultation_type" = ANY (ARRAY['catch-problem'::"text", 'aquaculture'::"text", 'processing-market'::"text", 'oil-contamination'::"text", 'climate-safety'::"text"]))),
    CONSTRAINT "fishing_consultations_resolution_outcome_check" CHECK (("resolution_outcome" = ANY (ARRAY['applied'::"text", 'partially_applied'::"text", 'not_applied'::"text"]))),
    CONSTRAINT "fishing_consultations_resolution_value_unit_check" CHECK (("resolution_value_unit" = ANY (ARRAY['NGN'::"text", 'kg'::"text", 'days_averted'::"text", 'animals_saved'::"text", 'other'::"text"]))),
    CONSTRAINT "fishing_consultations_urgency_level_check" CHECK (("urgency_level" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'urgent'::"text"])))
);


ALTER TABLE "public"."fishing_consultations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."health_assessments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "youth_user_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "assessment_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "triage_level" "text" DEFAULT 'pending'::"text" NOT NULL,
    "ai_triage_summary" "text",
    "referral_note" "text",
    "navigator_actions" "text",
    "conversation_history" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "follow_up_needed" boolean DEFAULT false NOT NULL,
    "follow_up_date" "date",
    "follow_up_notes" "text",
    "resolved" boolean DEFAULT false NOT NULL,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "probe_notes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "resolution_outcome" "text",
    "resolution_narrative" "text",
    "resolution_value_amount" numeric,
    "resolution_value_unit" "text",
    "resolution_value_label" "text",
    CONSTRAINT "health_assessments_resolution_outcome_check" CHECK (("resolution_outcome" = ANY (ARRAY['applied'::"text", 'partially_applied'::"text", 'not_applied'::"text"]))),
    CONSTRAINT "health_assessments_resolution_value_unit_check" CHECK (("resolution_value_unit" = ANY (ARRAY['NGN'::"text", 'kg'::"text", 'days_averted'::"text", 'animals_saved'::"text", 'other'::"text"]))),
    CONSTRAINT "health_assessments_triage_level_check" CHECK (("triage_level" = ANY (ARRAY['red'::"text", 'yellow'::"text", 'green'::"text", 'pending'::"text"])))
);


ALTER TABLE "public"."health_assessments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."health_assessments"."probe_notes" IS 'AI-coached clinical interview notes, keyed by symptom/observation label. Each value is the full Q&A transcript for that probe session. Passed as labelled sections to the AI triage prompt.';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "username" "text",
    "name" "text",
    "avatar_url" "text",
    "role" "public"."user_role" DEFAULT 'student'::"public"."user_role" NOT NULL,
    "grade_level" integer,
    "country" "text",
    "school_name" "text",
    "team_id" "uuid",
    "profile_completed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "city" "text" DEFAULT 'Dayton'::"text",
    "state" "text" DEFAULT 'Ohio'::"text",
    "gender" "text" DEFAULT 'NULL'::"text",
    "continent" "text" DEFAULT 'North America'::"text",
    "ai_playground_model" "text" DEFAULT 'claude-haiku-4-5-20251001'::"text",
    "organization_id" "uuid",
    "join_code_used" "text",
    "age" integer,
    "is_primary_leader" boolean DEFAULT false NOT NULL,
    "merged_into" "uuid",
    "is_active" boolean DEFAULT true,
    "videos_per_week" integer DEFAULT 5 NOT NULL,
    "agent_builder_access" boolean DEFAULT false NOT NULL,
    CONSTRAINT "profiles_grade_level_check" CHECK ((("grade_level" >= 1) AND ("grade_level" <= 12)))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."videos_per_week" IS 'Maximum AI video generations allowed per calendar week (Mon–Sun). Default 5; elevated to 50 for privileged users.';



CREATE OR REPLACE VIEW "public"."community_impact_resolutions" AS
 SELECT 'agriculture'::"text" AS "domain",
    "c"."id",
    "c"."youth_user_id",
    "p"."organization_id",
    "p"."city",
    "c"."resolved",
    "c"."resolution_outcome",
    "c"."resolution_value_amount",
    "c"."resolution_value_unit",
    "c"."resolution_value_label",
    "c"."created_at",
    "c"."resolved_at",
    "c"."problem_summary" AS "summary_text"
   FROM ("public"."agriculture_consultations" "c"
     LEFT JOIN "public"."profiles" "p" ON (("p"."id" = "c"."youth_user_id")))
UNION ALL
 SELECT 'fishing'::"text" AS "domain",
    "c"."id",
    "c"."youth_user_id",
    "p"."organization_id",
    "p"."city",
    "c"."resolved",
    "c"."resolution_outcome",
    "c"."resolution_value_amount",
    "c"."resolution_value_unit",
    "c"."resolution_value_label",
    "c"."created_at",
    "c"."resolved_at",
    "c"."problem_summary" AS "summary_text"
   FROM ("public"."fishing_consultations" "c"
     LEFT JOIN "public"."profiles" "p" ON (("p"."id" = "c"."youth_user_id")))
UNION ALL
 SELECT 'healthcare'::"text" AS "domain",
    "c"."id",
    "c"."youth_user_id",
    "p"."organization_id",
    "p"."city",
    "c"."resolved",
    "c"."resolution_outcome",
    "c"."resolution_value_amount",
    "c"."resolution_value_unit",
    "c"."resolution_value_label",
    "c"."created_at",
    "c"."resolved_at",
    "c"."ai_triage_summary" AS "summary_text"
   FROM ("public"."health_assessments" "c"
     LEFT JOIN "public"."profiles" "p" ON (("p"."id" = "c"."youth_user_id")))
UNION ALL
 SELECT 'entrepreneurship'::"text" AS "domain",
    "c"."id",
    "c"."youth_user_id",
    "p"."organization_id",
    "p"."city",
    "c"."resolved",
    "c"."resolution_outcome",
    "c"."resolution_value_amount",
    "c"."resolution_value_unit",
    "c"."resolution_value_label",
    "c"."created_at",
    "c"."resolved_at",
    "c"."problem_summary" AS "summary_text"
   FROM ("public"."entrepreneurship_consultations" "c"
     LEFT JOIN "public"."profiles" "p" ON (("p"."id" = "c"."youth_user_id")))
UNION ALL
 SELECT 'animal_husbandry'::"text" AS "domain",
    "c"."id",
    "c"."youth_user_id",
    "p"."organization_id",
    "p"."city",
    "c"."resolved",
    "c"."resolution_outcome",
    "c"."resolution_value_amount",
    "c"."resolution_value_unit",
    "c"."resolution_value_label",
    "c"."created_at",
    "c"."resolved_at",
    "c"."symptom_summary" AS "summary_text"
   FROM ("public"."animal_husbandry_consultations" "c"
     LEFT JOIN "public"."profiles" "p" ON (("p"."id" = "c"."youth_user_id")));


ALTER TABLE "public"."community_impact_resolutions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_impact_tiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "learner_id" "uuid" NOT NULL,
    "org_id" "text" NOT NULL,
    "tier" "text" NOT NULL,
    "tier_label" "text" NOT NULL,
    "challenge_id" "uuid",
    "enrollment_id" "uuid",
    "awarded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "evidence_summary" "text",
    "referred_learner_id" "uuid",
    CONSTRAINT "community_impact_tiers_tier_check" CHECK (("tier" = ANY (ARRAY['seed'::"text", 'scout'::"text", 'bridge'::"text", 'builder'::"text", 'multiplier'::"text"])))
);


ALTER TABLE "public"."community_impact_tiers" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."community_leaderboard" AS
 WITH "tier_rank_map"("tier", "tier_rank", "tier_label") AS (
         VALUES ('seed'::"text",1,'community teacher'::"text"), ('scout'::"text",2,'problem finder'::"text"), ('bridge'::"text",3,'community connector'::"text"), ('builder'::"text",4,'AI for good'::"text"), ('multiplier'::"text",5,'village leader'::"text")
        ), "learner_counts" AS (
         SELECT "cit"."learner_id",
            "cit"."org_id",
            "cit"."tier",
            "trm_1"."tier_rank",
            "trm_1"."tier_label",
            ("count"(*))::integer AS "tier_count",
            "max"("cit"."awarded_at") AS "last_awarded_at"
           FROM ("public"."community_impact_tiers" "cit"
             JOIN "tier_rank_map" "trm_1" ON (("trm_1"."tier" = "cit"."tier")))
          GROUP BY "cit"."learner_id", "cit"."org_id", "cit"."tier", "trm_1"."tier_rank", "trm_1"."tier_label"
        ), "learner_summary" AS (
         SELECT "learner_counts"."learner_id",
            "learner_counts"."org_id",
            "max"("learner_counts"."tier_rank") AS "best_tier_rank",
            ("sum"("learner_counts"."tier_count"))::integer AS "total_actions",
            "max"("learner_counts"."last_awarded_at") AS "last_action_at"
           FROM "learner_counts"
          GROUP BY "learner_counts"."learner_id", "learner_counts"."org_id"
        )
 SELECT "ls"."learner_id",
    "ls"."org_id",
    "p"."name",
    "p"."avatar_url",
    "trm"."tier" AS "highest_tier",
    "trm"."tier_label" AS "highest_tier_label",
    "ls"."total_actions",
    "ls"."last_action_at",
    COALESCE(( SELECT "lc"."tier_count"
           FROM "learner_counts" "lc"
          WHERE (("lc"."learner_id" = "ls"."learner_id") AND ("lc"."org_id" = "ls"."org_id") AND ("lc"."tier" = 'seed'::"text"))), 0) AS "seed_count",
    COALESCE(( SELECT "lc"."tier_count"
           FROM "learner_counts" "lc"
          WHERE (("lc"."learner_id" = "ls"."learner_id") AND ("lc"."org_id" = "ls"."org_id") AND ("lc"."tier" = 'scout'::"text"))), 0) AS "scout_count",
    COALESCE(( SELECT "lc"."tier_count"
           FROM "learner_counts" "lc"
          WHERE (("lc"."learner_id" = "ls"."learner_id") AND ("lc"."org_id" = "ls"."org_id") AND ("lc"."tier" = 'bridge'::"text"))), 0) AS "bridge_count",
    COALESCE(( SELECT "lc"."tier_count"
           FROM "learner_counts" "lc"
          WHERE (("lc"."learner_id" = "ls"."learner_id") AND ("lc"."org_id" = "ls"."org_id") AND ("lc"."tier" = 'builder'::"text"))), 0) AS "builder_count",
    COALESCE(( SELECT "lc"."tier_count"
           FROM "learner_counts" "lc"
          WHERE (("lc"."learner_id" = "ls"."learner_id") AND ("lc"."org_id" = "ls"."org_id") AND ("lc"."tier" = 'multiplier'::"text"))), 0) AS "multiplier_count",
    "row_number"() OVER (PARTITION BY "ls"."org_id" ORDER BY "ls"."best_tier_rank" DESC, "ls"."total_actions" DESC, "ls"."last_action_at" DESC) AS "rank"
   FROM (("learner_summary" "ls"
     JOIN "tier_rank_map" "trm" ON (("trm"."tier_rank" = "ls"."best_tier_rank")))
     JOIN "public"."profiles" "p" ON (("p"."id" = "ls"."learner_id")))
  WHERE ("p"."role" = 'student'::"public"."user_role");


ALTER TABLE "public"."community_leaderboard" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consultation_evidence_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "learner_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "consultation_domain" "text" NOT NULL,
    "consultation_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "consultation_evidence_links_consultation_domain_check" CHECK (("consultation_domain" = ANY (ARRAY['agriculture'::"text", 'fishing'::"text", 'healthcare'::"text", 'entrepreneurship'::"text", 'animal_husbandry'::"text", 'enterprise'::"text"]))),
    CONSTRAINT "consultation_evidence_links_source_type_check" CHECK (("source_type" = ANY (ARRAY['challenge_enrollment'::"text", 'grand_challenge_submission'::"text"])))
);


ALTER TABLE "public"."consultation_evidence_links" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."cowork_eligible_users" AS
 SELECT "profiles"."id" AS "user_id"
   FROM "public"."profiles"
  WHERE ("profiles"."agent_builder_access" = true);


ALTER TABLE "public"."cowork_eligible_users" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."current_challenge_leaderboard" AS
 SELECT "ce"."challenge_id",
    "ce"."learner_id",
    "ce"."org_id",
    "p"."name",
    "p"."avatar_url",
    "ce"."tier_awarded",
        CASE "ce"."tier_awarded"
            WHEN 'seed'::"text" THEN 'Community Teacher'::"text"
            WHEN 'scout'::"text" THEN 'Problem Finder'::"text"
            WHEN 'bridge'::"text" THEN 'Community Connector'::"text"
            WHEN 'builder'::"text" THEN 'AI for Good'::"text"
            WHEN 'multiplier'::"text" THEN 'Village Leader'::"text"
            ELSE NULL::"text"
        END AS "tier_label",
    "ce"."status",
    "ce"."action_taken",
    "ce"."impact_observed",
    "ce"."submitted_at",
    "ce"."awarded_at",
    "row_number"() OVER (PARTITION BY "ce"."challenge_id" ORDER BY
        CASE "ce"."tier_awarded"
            WHEN 'multiplier'::"text" THEN 5
            WHEN 'builder'::"text" THEN 4
            WHEN 'bridge'::"text" THEN 3
            WHEN 'scout'::"text" THEN 2
            WHEN 'seed'::"text" THEN 1
            ELSE 0
        END DESC, "ce"."awarded_at", "ce"."submitted_at") AS "rank"
   FROM ("public"."challenge_enrollments" "ce"
     JOIN "public"."profiles" "p" ON (("p"."id" = "ce"."learner_id")))
  WHERE ("ce"."tier_awarded" IS NOT NULL);


ALTER TABLE "public"."current_challenge_leaderboard" OWNER TO "postgres";


COMMENT ON VIEW "public"."current_challenge_leaderboard" IS 'Leaderboard scoped to a single challenge_id — pass it via .eq(challenge_id, ...) from the client. Ranked by tier ordinal, tie-broken by whoever was awarded first. Query the all-time community_leaderboard view separately for lifetime recognition.';



CREATE TABLE IF NOT EXISTS "public"."daily_activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "log_date" "date" NOT NULL,
    "logged_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "active_users" integer DEFAULT 0 NOT NULL,
    "cat_ai_learning" integer DEFAULT 0 NOT NULL,
    "cat_skills_development" integer DEFAULT 0 NOT NULL,
    "cat_english_skills" integer DEFAULT 0 NOT NULL,
    "cat_ai_proficiency_cert" integer DEFAULT 0 NOT NULL,
    "cat_other" integer DEFAULT 0 NOT NULL,
    "playground_users" integer DEFAULT 0 NOT NULL,
    "playground_chats_total" integer DEFAULT 0 NOT NULL,
    "cert_attempted_users" integer DEFAULT 0 NOT NULL,
    "cert_attempted_today" integer DEFAULT 0 NOT NULL,
    "total_activities" integer DEFAULT 0 NOT NULL,
    "total_africa_users" integer DEFAULT 0 NOT NULL,
    "city" "text" DEFAULT 'Oloibiri'::"text" NOT NULL,
    "cost_anthropic_usd" numeric(10,6),
    "cost_groq_requests" integer,
    "cost_cache_savings_usd" numeric(10,6),
    "cost_cache_hit_rate_pct" integer,
    "cost_total_requests" integer
);


ALTER TABLE "public"."daily_activity_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."daily_activity_log" IS 'Daily Africa-cohort engagement snapshot — active_users/playground_users are DISTINCT user counts; category columns and total_activities are ROW counts. Populated by the daily-report Vercel cron at 11:00 UTC (12:00 Nigerian WAT)';



COMMENT ON COLUMN "public"."daily_activity_log"."cost_anthropic_usd" IS 'Total Anthropic API cost for this day in USD';



COMMENT ON COLUMN "public"."daily_activity_log"."cost_groq_requests" IS 'Total Groq requests this day (free tier)';



COMMENT ON COLUMN "public"."daily_activity_log"."cost_cache_savings_usd" IS 'Estimated savings from prompt caching this day';



COMMENT ON COLUMN "public"."daily_activity_log"."cost_cache_hit_rate_pct" IS 'Cache hit rate as integer percent (0-100)';



COMMENT ON COLUMN "public"."daily_activity_log"."cost_total_requests" IS 'Total API requests (Anthropic + Groq) this day';



CREATE TABLE IF NOT EXISTS "public"."daily_reflections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reflection_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "camp_day" integer,
    "prompt_text" "text" NOT NULL,
    "reflection_text" "text" DEFAULT ''::"text" NOT NULL,
    "shared_aloud" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."daily_reflections" OWNER TO "postgres";


COMMENT ON TABLE "public"."daily_reflections" IS 'One free-text reflection per student per calendar day, platform-wide. Private — never surfaced on public leaderboards. Facilitators can read; peers cannot. camp_day is optional metadata, not the primary key of the feature.';



CREATE TABLE IF NOT EXISTS "public"."dashboard" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text",
    "activity" "text" NOT NULL,
    "category_activity" "text",
    "progress" "public"."progress_status" DEFAULT 'not started'::"public"."progress_status" NOT NULL,
    "certification_evaluation_score" numeric(4,2),
    "certification_evaluation_evidence" "text",
    "learning_module_id" "uuid",
    "grade_level" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "sub_category" character varying(255),
    "team_activity" "text" DEFAULT 'no'::"text",
    "team_name" "text",
    "team_id" "uuid",
    "chat_history" "text",
    "continent" "text" DEFAULT '''Africa''::text'::"text",
    "country" "text" DEFAULT 'NULL'::"text",
    "certification_evaluation_UNESCO_1_score" smallint,
    "certification_evaluation_UNESCO_2_score" smallint,
    "certification_evaluation_UNESCO_3_score" smallint,
    "certification_evaluation_UNESCO_4_score" smallint,
    "certification_evaluation_UNESCO_1_evidence" "text",
    "certification_evaluation_UNESCO_2_evidence" "text",
    "certification_evaluation_UNESCO_3_evidence" "text",
    "certification_evaluation_UNESCO_4_evidence" "text",
    "certification_evaluation_vibe_coding_problem_decomposition_scor" smallint,
    "certification_evaluation_vibe_coding_problem_decomposition_evid" "text",
    "certification_evaluation_vibe_coding_prompt_engineering_score" smallint,
    "certification_evaluation_vibe_coding_prompt_engineering_evidenc" "text",
    "certification_evaluation_vibe_coding_ai_output_evaluation_score" smallint,
    "certification_evaluation_vibe_coding_ai_output_evaluation_evide" "text",
    "certification_evaluation_vibe_coding_metacognitive_control_scor" smallint,
    "certification_evaluation_vibe_coding_metacognitive_control_evid" "text",
    "certification_evaluation_critical_thinking_logical_reasoning_sc" smallint,
    "certification_evaluation_critical_thinking_logical_reasoning_ev" "text",
    "certification_evaluation_critical_thinking_reflection_evidence" "text",
    "certification_evaluation_critical_thinking_reflection_score" smallint,
    "certification_evaluation_problem_solving_problem_definition_sco" smallint,
    "certification_evaluation_problem_solving_problem_definition_evi" "text",
    "certification_evaluation_problem_solving_iteration_score" smallint,
    "certification_evaluation_problem_solving_iteration_evidence" "text",
    "certification_evaluation_creativity_originality_evidence" "text",
    "certification_evaluation_creativity_originality_score" smallint,
    "certification_evaluation_creativity_risk_and_exploration_eviden" "text",
    "certification_evaluation_creativity_risk_and_exploration_score" smallint,
    "certification_evaluation_communication_clarity_score" smallint,
    "certification_evaluation_communication_clarity_evidence" "text",
    "certification_evaluation_communication_listening_and_response_s" smallint,
    "certification_evaluation_communication_listening_and_response_e" "text",
    "certification_evaluation_device_familiarity_and_control_score" smallint,
    "certification_evaluation_device_familiarity_and_control_evidenc" "text",
    "certification_evaluation_typing_and_text_entry_score" smallint,
    "certification_evaluation_typing_and_text_entry_evidence" "text",
    "certification_evaluation_file_and_application_management_score" smallint,
    "certification_evaluation_file_and_application_management_eviden" "text",
    "certification_evaluation_internet_navigation_score" smallint,
    "certification_evaluation_internet_navigation_evidence" "text",
    "certification_evaluation_online_research_and_information_use_sc" smallint,
    "certification_evaluation_online_research_and_information_use_ev" "text",
    "certification_evaluation_digital_safety_and_responsibility_scor" smallint,
    "certification_evaluation_digital_safety_and_responsibility_evid" "text",
    "certification_evaluation_basic_troubleshooting_and_resilience_s" smallint,
    "certification_evaluation_basic_troubleshooting_and_resilience_e" "text",
    "certification_critical_thinking_reflection_score" integer,
    "certification_critical_thinking_reflection_evidence" "text",
    "certification_vibe_coding_problem_decomposition_score" integer,
    "certification_vibe_coding_problem_decomposition_evidence" "text",
    "certification_digital_fluency_internet_navigation_score" integer,
    "certification_digital_fluency_internet_navigation_evidence" "text",
    "certification_vibe_coding_ai_output_evaluation_score" integer,
    "certification_vibe_coding_ai_output_evaluation_evidence" "text",
    "certification_creativity_creative_iteration_score" integer,
    "certification_creativity_creative_iteration_evidence" "text",
    "certification_critical_thinking_claim_evaluation_score" integer,
    "certification_critical_thinking_claim_evaluation_evidence" "text",
    "certification_digital_fluency_troubleshooting_score" integer,
    "certification_digital_fluency_troubleshooting_evidence" "text",
    "certification_ai_proficiency_ethics_responsibility_score" integer,
    "certification_ai_proficiency_ethics_responsibility_evidence" "text",
    "certification_ai_proficiency_verification_bias_score" integer,
    "certification_ai_proficiency_verification_bias_evidence" "text",
    "certification_critical_thinking_reasoning_trace_score" integer,
    "certification_critical_thinking_reasoning_trace_evidence" "text",
    "certification_ai_proficiency_application_of_ai_score" integer,
    "certification_ai_proficiency_application_of_ai_evidence" "text",
    "certification_creativity_originality_score" integer,
    "certification_creativity_originality_evidence" "text",
    "certification_communication_clarity_score" integer,
    "certification_communication_clarity_evidence" "text",
    "certification_problem_solving_outcome_measurement_score" integer,
    "certification_problem_solving_outcome_measurement_evidence" "text",
    "certification_communication_listening_response_score" integer,
    "certification_communication_listening_response_evidence" "text",
    "certification_creativity_exploration_score" integer,
    "certification_creativity_exploration_evidence" "text",
    "certification_vibe_coding_prompt_engineering_score" integer,
    "certification_vibe_coding_prompt_engineering_evidence" "text",
    "certification_digital_fluency_device_file_control_score" integer,
    "certification_digital_fluency_device_file_control_evidence" "text",
    "certification_communication_synthesis_score" integer,
    "certification_communication_synthesis_evidence" "text",
    "certification_ai_proficiency_understanding_ai_score" integer,
    "certification_ai_proficiency_understanding_ai_evidence" "text",
    "certification_problem_solving_problem_definition_score" integer,
    "certification_problem_solving_problem_definition_evidence" "text",
    "certification_problem_solving_iteration_score" integer,
    "certification_problem_solving_iteration_evidence" "text",
    "certificate_pdf_url" "text",
    "web_dev_critique" "jsonb"[],
    "web_dev_session_id" "text",
    "web_dev_session_name" "text",
    "web_dev_pages" "jsonb" DEFAULT '[]'::"jsonb",
    "web_dev_prompts" "jsonb" DEFAULT '[]'::"jsonb",
    "web_dev_evaluation" "jsonb",
    "web_dev_advice" "text",
    "web_dev_images" "jsonb",
    "english_skills_evaluation" "jsonb",
    "web_dev_storage_path" "text",
    "video_critique" "text",
    "video_chat_history" "jsonb",
    "video_prompt" "text",
    "video_url" "text",
    "image_prompt" "text",
    "image_url" "text",
    "image_critique" "text",
    "image_chat_history" "jsonb",
    "voice_script" "text",
    "voice_audio_url" "text",
    "voice_critique" "text",
    "content_session_id" "text",
    "content_session_name" "text",
    "content_type" "text",
    "content_pieces" "jsonb",
    "content_prompts" "jsonb",
    "content_evaluation" "jsonb",
    "workflow_session_id" "text",
    "workflow_session_name" "text",
    "workflow_pages" "jsonb",
    "workflow_prompts" "jsonb",
    "workflow_evaluation" "jsonb",
    "business_session_id" "text",
    "business_session_name" "text",
    "business_canvas" "jsonb",
    "business_prompts" "jsonb",
    "business_evaluation" "jsonb",
    "image_cert_session_id" "text",
    "image_cert_evaluation" "jsonb",
    "voice_cert_session_id" "text",
    "voice_cert_evaluation" "jsonb",
    "voice_cert_portfolio" "jsonb",
    "fs_cert_session_id" "text",
    "fs_cert_pages" "jsonb",
    "fs_cert_evaluation" "jsonb",
    "wf_cert_session_id" "text",
    "wf_cert_pages" "jsonb",
    "wf_cert_evaluation" "jsonb",
    "biz_cert_session_id" "text",
    "biz_cert_canvas" "jsonb",
    "biz_cert_evaluation" "jsonb",
    "vibe_cert_session_id" "text",
    "vibe_cert_code" "text",
    "vibe_cert_language" "text",
    "vibe_cert_evaluation" "jsonb",
    "ambassador_cert_session_id" "text",
    "ambassador_cert_portfolio" "jsonb",
    "ambassador_cert_evaluation" "jsonb",
    "agriculture_cert_session_id" "text",
    "agriculture_cert_portfolio" "jsonb",
    "agriculture_cert_evaluation" "jsonb",
    "fishing_cert_session_id" "text",
    "fishing_cert_portfolio" "jsonb",
    "fishing_cert_evaluation" "jsonb",
    "healthcare_cert_session_id" "text",
    "healthcare_cert_portfolio" "jsonb",
    "healthcare_cert_evaluation" "jsonb",
    "entrepreneurship_cert_session_id" "text",
    "entrepreneurship_cert_portfolio" "jsonb",
    "entrepreneurship_cert_evaluation" "jsonb",
    "dp900_session_id" "text",
    "dp900_session_name" "text",
    "dp900_prompts" "jsonb" DEFAULT '[]'::"jsonb",
    "dp900_evaluation" "jsonb",
    "ai900_session_id" "text",
    "ai900_session_name" "text",
    "ai900_prompts" "jsonb" DEFAULT '[]'::"jsonb",
    "ai900_evaluation" "jsonb",
    "ab730_session_id" "text",
    "ab730_session_name" "text",
    "ab730_prompts" "jsonb" DEFAULT '[]'::"jsonb",
    "ab730_evaluation" "jsonb",
    "gh300_session_id" "text",
    "gh300_session_name" "text",
    "gh300_prompts" "jsonb",
    "gh300_evaluation" "jsonb",
    "fs_session_id" "text",
    "fs_session_name" "text",
    "fs_pages" "jsonb" DEFAULT '[]'::"jsonb",
    "fs_prompts" "jsonb" DEFAULT '[]'::"jsonb",
    "fs_evaluation" "jsonb",
    "math_skills_evaluation" "jsonb",
    "science_skills_evaluation" "jsonb",
    CONSTRAINT "certification_scores_range_check" CHECK (((("certification_evaluation_score" IS NULL) OR (("certification_evaluation_score" >= (0)::numeric) AND ("certification_evaluation_score" <= (3)::numeric))) AND (("certification_evaluation_UNESCO_1_score" IS NULL) OR (("certification_evaluation_UNESCO_1_score" >= 0) AND ("certification_evaluation_UNESCO_1_score" <= 3))) AND (("certification_evaluation_UNESCO_2_score" IS NULL) OR (("certification_evaluation_UNESCO_2_score" >= 0) AND ("certification_evaluation_UNESCO_2_score" <= 3))) AND (("certification_evaluation_UNESCO_3_score" IS NULL) OR (("certification_evaluation_UNESCO_3_score" >= 0) AND ("certification_evaluation_UNESCO_3_score" <= 3))) AND (("certification_evaluation_UNESCO_4_score" IS NULL) OR (("certification_evaluation_UNESCO_4_score" >= 0) AND ("certification_evaluation_UNESCO_4_score" <= 3))) AND (("certification_critical_thinking_reflection_score" IS NULL) OR (("certification_critical_thinking_reflection_score" >= 0) AND ("certification_critical_thinking_reflection_score" <= 3))) AND (("certification_vibe_coding_problem_decomposition_score" IS NULL) OR (("certification_vibe_coding_problem_decomposition_score" >= 0) AND ("certification_vibe_coding_problem_decomposition_score" <= 3))) AND (("certification_digital_fluency_internet_navigation_score" IS NULL) OR (("certification_digital_fluency_internet_navigation_score" >= 0) AND ("certification_digital_fluency_internet_navigation_score" <= 3))) AND (("certification_vibe_coding_ai_output_evaluation_score" IS NULL) OR (("certification_vibe_coding_ai_output_evaluation_score" >= 0) AND ("certification_vibe_coding_ai_output_evaluation_score" <= 3))) AND (("certification_creativity_creative_iteration_score" IS NULL) OR (("certification_creativity_creative_iteration_score" >= 0) AND ("certification_creativity_creative_iteration_score" <= 3))) AND (("certification_critical_thinking_claim_evaluation_score" IS NULL) OR (("certification_critical_thinking_claim_evaluation_score" >= 0) AND ("certification_critical_thinking_claim_evaluation_score" <= 3))) AND (("certification_digital_fluency_troubleshooting_score" IS NULL) OR (("certification_digital_fluency_troubleshooting_score" >= 0) AND ("certification_digital_fluency_troubleshooting_score" <= 3))) AND (("certification_ai_proficiency_ethics_responsibility_score" IS NULL) OR (("certification_ai_proficiency_ethics_responsibility_score" >= 0) AND ("certification_ai_proficiency_ethics_responsibility_score" <= 3))) AND (("certification_ai_proficiency_verification_bias_score" IS NULL) OR (("certification_ai_proficiency_verification_bias_score" >= 0) AND ("certification_ai_proficiency_verification_bias_score" <= 3))) AND (("certification_critical_thinking_reasoning_trace_score" IS NULL) OR (("certification_critical_thinking_reasoning_trace_score" >= 0) AND ("certification_critical_thinking_reasoning_trace_score" <= 3))) AND (("certification_ai_proficiency_application_of_ai_score" IS NULL) OR (("certification_ai_proficiency_application_of_ai_score" >= 0) AND ("certification_ai_proficiency_application_of_ai_score" <= 3))) AND (("certification_creativity_originality_score" IS NULL) OR (("certification_creativity_originality_score" >= 0) AND ("certification_creativity_originality_score" <= 3))) AND (("certification_communication_clarity_score" IS NULL) OR (("certification_communication_clarity_score" >= 0) AND ("certification_communication_clarity_score" <= 3))) AND (("certification_problem_solving_outcome_measurement_score" IS NULL) OR (("certification_problem_solving_outcome_measurement_score" >= 0) AND ("certification_problem_solving_outcome_measurement_score" <= 3))) AND (("certification_communication_listening_response_score" IS NULL) OR (("certification_communication_listening_response_score" >= 0) AND ("certification_communication_listening_response_score" <= 3))) AND (("certification_creativity_exploration_score" IS NULL) OR (("certification_creativity_exploration_score" >= 0) AND ("certification_creativity_exploration_score" <= 3))) AND (("certification_vibe_coding_prompt_engineering_score" IS NULL) OR (("certification_vibe_coding_prompt_engineering_score" >= 0) AND ("certification_vibe_coding_prompt_engineering_score" <= 3))) AND (("certification_digital_fluency_device_file_control_score" IS NULL) OR (("certification_digital_fluency_device_file_control_score" >= 0) AND ("certification_digital_fluency_device_file_control_score" <= 3))) AND (("certification_communication_synthesis_score" IS NULL) OR (("certification_communication_synthesis_score" >= 0) AND ("certification_communication_synthesis_score" <= 3))) AND (("certification_ai_proficiency_understanding_ai_score" IS NULL) OR (("certification_ai_proficiency_understanding_ai_score" >= 0) AND ("certification_ai_proficiency_understanding_ai_score" <= 3))) AND (("certification_problem_solving_problem_definition_score" IS NULL) OR (("certification_problem_solving_problem_definition_score" >= 0) AND ("certification_problem_solving_problem_definition_score" <= 3))) AND (("certification_problem_solving_iteration_score" IS NULL) OR (("certification_problem_solving_iteration_score" >= 0) AND ("certification_problem_solving_iteration_score" <= 3))) AND (("certification_evaluation_vibe_coding_problem_decomposition_scor" IS NULL) OR (("certification_evaluation_vibe_coding_problem_decomposition_scor" >= 0) AND ("certification_evaluation_vibe_coding_problem_decomposition_scor" <= 3))) AND (("certification_evaluation_vibe_coding_prompt_engineering_score" IS NULL) OR (("certification_evaluation_vibe_coding_prompt_engineering_score" >= 0) AND ("certification_evaluation_vibe_coding_prompt_engineering_score" <= 3))) AND (("certification_evaluation_vibe_coding_ai_output_evaluation_score" IS NULL) OR (("certification_evaluation_vibe_coding_ai_output_evaluation_score" >= 0) AND ("certification_evaluation_vibe_coding_ai_output_evaluation_score" <= 3))) AND (("certification_evaluation_vibe_coding_metacognitive_control_scor" IS NULL) OR (("certification_evaluation_vibe_coding_metacognitive_control_scor" >= 0) AND ("certification_evaluation_vibe_coding_metacognitive_control_scor" <= 3))) AND (("certification_evaluation_critical_thinking_logical_reasoning_sc" IS NULL) OR (("certification_evaluation_critical_thinking_logical_reasoning_sc" >= 0) AND ("certification_evaluation_critical_thinking_logical_reasoning_sc" <= 3))) AND (("certification_evaluation_critical_thinking_reflection_score" IS NULL) OR (("certification_evaluation_critical_thinking_reflection_score" >= 0) AND ("certification_evaluation_critical_thinking_reflection_score" <= 3))) AND (("certification_evaluation_problem_solving_problem_definition_sco" IS NULL) OR (("certification_evaluation_problem_solving_problem_definition_sco" >= 0) AND ("certification_evaluation_problem_solving_problem_definition_sco" <= 3))) AND (("certification_evaluation_problem_solving_iteration_score" IS NULL) OR (("certification_evaluation_problem_solving_iteration_score" >= 0) AND ("certification_evaluation_problem_solving_iteration_score" <= 3))) AND (("certification_evaluation_creativity_originality_score" IS NULL) OR (("certification_evaluation_creativity_originality_score" >= 0) AND ("certification_evaluation_creativity_originality_score" <= 3))) AND (("certification_evaluation_creativity_risk_and_exploration_score" IS NULL) OR (("certification_evaluation_creativity_risk_and_exploration_score" >= 0) AND ("certification_evaluation_creativity_risk_and_exploration_score" <= 3))) AND (("certification_evaluation_communication_clarity_score" IS NULL) OR (("certification_evaluation_communication_clarity_score" >= 0) AND ("certification_evaluation_communication_clarity_score" <= 3))) AND (("certification_evaluation_communication_listening_and_response_s" IS NULL) OR (("certification_evaluation_communication_listening_and_response_s" >= 0) AND ("certification_evaluation_communication_listening_and_response_s" <= 3))) AND (("certification_evaluation_device_familiarity_and_control_score" IS NULL) OR (("certification_evaluation_device_familiarity_and_control_score" >= 0) AND ("certification_evaluation_device_familiarity_and_control_score" <= 3))) AND (("certification_evaluation_typing_and_text_entry_score" IS NULL) OR (("certification_evaluation_typing_and_text_entry_score" >= 0) AND ("certification_evaluation_typing_and_text_entry_score" <= 3))) AND (("certification_evaluation_file_and_application_management_score" IS NULL) OR (("certification_evaluation_file_and_application_management_score" >= 0) AND ("certification_evaluation_file_and_application_management_score" <= 3))) AND (("certification_evaluation_internet_navigation_score" IS NULL) OR (("certification_evaluation_internet_navigation_score" >= 0) AND ("certification_evaluation_internet_navigation_score" <= 3))) AND (("certification_evaluation_online_research_and_information_use_sc" IS NULL) OR (("certification_evaluation_online_research_and_information_use_sc" >= 0) AND ("certification_evaluation_online_research_and_information_use_sc" <= 3))) AND (("certification_evaluation_digital_safety_and_responsibility_scor" IS NULL) OR (("certification_evaluation_digital_safety_and_responsibility_scor" >= 0) AND ("certification_evaluation_digital_safety_and_responsibility_scor" <= 3))) AND (("certification_evaluation_basic_troubleshooting_and_resilience_s" IS NULL) OR (("certification_evaluation_basic_troubleshooting_and_resilience_s" >= 0) AND ("certification_evaluation_basic_troubleshooting_and_resilience_s" <= 3))))),
    CONSTRAINT "dashboard_evaluation_score_check" CHECK ((("certification_evaluation_score" IS NULL) OR (("certification_evaluation_score" >= (0)::numeric) AND ("certification_evaluation_score" <= (3)::numeric)))),
    CONSTRAINT "dashboard_grade_level_check" CHECK ((("grade_level" >= 1) AND ("grade_level" <= 12))),
    CONSTRAINT "dashboard_team_activity_check" CHECK (("team_activity" = ANY (ARRAY['yes'::"text", 'no'::"text"])))
);


ALTER TABLE "public"."dashboard" OWNER TO "postgres";


COMMENT ON COLUMN "public"."dashboard"."certificate_pdf_url" IS 'Public URL to certificate PDF stored in Supabase Storage certificates bucket';



CREATE OR REPLACE VIEW "public"."dashboard_activity_streams" AS
 SELECT ("date_trunc"('month'::"text", "d"."created_at"))::"date" AS "activity_month",
        CASE
            WHEN ("d"."activity" = 'science_skills'::"text") THEN 'Science'::"text"
            WHEN ("d"."category_activity" = ANY (ARRAY['Counting & Number Sense'::"text", 'Fractions & Decimals'::"text", 'Multiplication & Division'::"text", 'Ratios, Rates & Proportions'::"text", 'Measurement & Geometry'::"text", 'Addition & Subtraction'::"text", 'Algebra & Geometry'::"text"])) THEN 'Math'::"text"
            WHEN ("d"."category_activity" = ANY (ARRAY['Oral Expression'::"text", 'Listening & Response'::"text", 'Written Communication'::"text", 'Reading Fluency'::"text", 'Skills Development'::"text"])) THEN 'English'::"text"
            WHEN ("d"."category_activity" = 'Community Impact'::"text") THEN 'Community Impact'::"text"
            WHEN ("d"."category_activity" = ANY (ARRAY['Vibe Coding'::"text", 'Applied Creativity'::"text", 'Image Generation'::"text", 'Voice Generation'::"text", 'Video Generation'::"text", 'Collaborative Project'::"text", 'Tech Workshop'::"text", 'AI Learning'::"text", 'AI-Enhanced Writing'::"text"])) THEN 'Tech Skills'::"text"
            WHEN ("d"."category_activity" = ANY (ARRAY['AI Proficiency'::"text", 'Skills'::"text", 'Digital Fluency'::"text", 'Critical Thinking'::"text", 'Problem Solving'::"text", 'Communications'::"text", 'Certification'::"text", 'Tutor'::"text", 'Project'::"text"])) THEN 'AI Proficiency & Skills'::"text"
            ELSE NULL::"text"
        END AS "stream",
    "count"(*) AS "activity_count"
   FROM ("public"."dashboard" "d"
     JOIN "public"."profiles" "p" ON (("p"."id" = "d"."user_id")))
  WHERE (("p"."role" = ANY (ARRAY['learner'::"public"."user_role", 'student'::"public"."user_role"])) AND ("d"."created_at" >= '2025-07-01 00:00:00+00'::timestamp with time zone) AND ("d"."category_activity" IS NOT NULL))
  GROUP BY (("date_trunc"('month'::"text", "d"."created_at"))::"date"),
        CASE
            WHEN ("d"."activity" = 'science_skills'::"text") THEN 'Science'::"text"
            WHEN ("d"."category_activity" = ANY (ARRAY['Counting & Number Sense'::"text", 'Fractions & Decimals'::"text", 'Multiplication & Division'::"text", 'Ratios, Rates & Proportions'::"text", 'Measurement & Geometry'::"text", 'Addition & Subtraction'::"text", 'Algebra & Geometry'::"text"])) THEN 'Math'::"text"
            WHEN ("d"."category_activity" = ANY (ARRAY['Oral Expression'::"text", 'Listening & Response'::"text", 'Written Communication'::"text", 'Reading Fluency'::"text", 'Skills Development'::"text"])) THEN 'English'::"text"
            WHEN ("d"."category_activity" = 'Community Impact'::"text") THEN 'Community Impact'::"text"
            WHEN ("d"."category_activity" = ANY (ARRAY['Vibe Coding'::"text", 'Applied Creativity'::"text", 'Image Generation'::"text", 'Voice Generation'::"text", 'Video Generation'::"text", 'Collaborative Project'::"text", 'Tech Workshop'::"text", 'AI Learning'::"text", 'AI-Enhanced Writing'::"text"])) THEN 'Tech Skills'::"text"
            WHEN ("d"."category_activity" = ANY (ARRAY['AI Proficiency'::"text", 'Skills'::"text", 'Digital Fluency'::"text", 'Critical Thinking'::"text", 'Problem Solving'::"text", 'Communications'::"text", 'Certification'::"text", 'Tutor'::"text", 'Project'::"text"])) THEN 'AI Proficiency & Skills'::"text"
            ELSE NULL::"text"
        END
 HAVING (
        CASE
            WHEN ("d"."activity" = 'science_skills'::"text") THEN 'Science'::"text"
            WHEN ("d"."category_activity" = ANY (ARRAY['Counting & Number Sense'::"text", 'Fractions & Decimals'::"text", 'Multiplication & Division'::"text", 'Ratios, Rates & Proportions'::"text", 'Measurement & Geometry'::"text", 'Addition & Subtraction'::"text", 'Algebra & Geometry'::"text"])) THEN 'Math'::"text"
            WHEN ("d"."category_activity" = ANY (ARRAY['Oral Expression'::"text", 'Listening & Response'::"text", 'Written Communication'::"text", 'Reading Fluency'::"text", 'Skills Development'::"text"])) THEN 'English'::"text"
            WHEN ("d"."category_activity" = 'Community Impact'::"text") THEN 'Community Impact'::"text"
            WHEN ("d"."category_activity" = ANY (ARRAY['Vibe Coding'::"text", 'Applied Creativity'::"text", 'Image Generation'::"text", 'Voice Generation'::"text", 'Video Generation'::"text", 'Collaborative Project'::"text", 'Tech Workshop'::"text", 'AI Learning'::"text", 'AI-Enhanced Writing'::"text"])) THEN 'Tech Skills'::"text"
            WHEN ("d"."category_activity" = ANY (ARRAY['AI Proficiency'::"text", 'Skills'::"text", 'Digital Fluency'::"text", 'Critical Thinking'::"text", 'Problem Solving'::"text", 'Communications'::"text", 'Certification'::"text", 'Tutor'::"text", 'Project'::"text"])) THEN 'AI Proficiency & Skills'::"text"
            ELSE NULL::"text"
        END IS NOT NULL)
  ORDER BY (("date_trunc"('month'::"text", "d"."created_at"))::"date"),
        CASE
            WHEN ("d"."activity" = 'science_skills'::"text") THEN 'Science'::"text"
            WHEN ("d"."category_activity" = ANY (ARRAY['Counting & Number Sense'::"text", 'Fractions & Decimals'::"text", 'Multiplication & Division'::"text", 'Ratios, Rates & Proportions'::"text", 'Measurement & Geometry'::"text", 'Addition & Subtraction'::"text", 'Algebra & Geometry'::"text"])) THEN 'Math'::"text"
            WHEN ("d"."category_activity" = ANY (ARRAY['Oral Expression'::"text", 'Listening & Response'::"text", 'Written Communication'::"text", 'Reading Fluency'::"text", 'Skills Development'::"text"])) THEN 'English'::"text"
            WHEN ("d"."category_activity" = 'Community Impact'::"text") THEN 'Community Impact'::"text"
            WHEN ("d"."category_activity" = ANY (ARRAY['Vibe Coding'::"text", 'Applied Creativity'::"text", 'Image Generation'::"text", 'Voice Generation'::"text", 'Video Generation'::"text", 'Collaborative Project'::"text", 'Tech Workshop'::"text", 'AI Learning'::"text", 'AI-Enhanced Writing'::"text"])) THEN 'Tech Skills'::"text"
            WHEN ("d"."category_activity" = ANY (ARRAY['AI Proficiency'::"text", 'Skills'::"text", 'Digital Fluency'::"text", 'Critical Thinking'::"text", 'Problem Solving'::"text", 'Communications'::"text", 'Certification'::"text", 'Tutor'::"text", 'Project'::"text"])) THEN 'AI Proficiency & Skills'::"text"
            ELSE NULL::"text"
        END;


ALTER TABLE "public"."dashboard_activity_streams" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."dashboard_stats_alltime" AS
 WITH "deduped" AS (
         SELECT DISTINCT ON ("dashboard_stats"."learner_token", "dashboard_stats"."cohort_month") "dashboard_stats"."learner_token",
            "dashboard_stats"."cohort_month",
            "dashboard_stats"."session_count",
            "dashboard_stats"."certifications_earned_total"
           FROM "public"."dashboard_stats"
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


ALTER TABLE "public"."dashboard_stats_alltime" OWNER TO "postgres";


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


ALTER TABLE "public"."dashboard_stats_public" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."debrief_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phase_id" "uuid" NOT NULL,
    "question_text" "text" NOT NULL,
    "blooms_level" "text" NOT NULL,
    "expected_concepts" "text"[],
    "min_word_count" integer DEFAULT 30,
    "display_order" integer DEFAULT 0,
    "is_required" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "debrief_questions_blooms_level_check" CHECK (("blooms_level" = ANY (ARRAY['recall'::"text", 'comprehension'::"text", 'application'::"text", 'analysis'::"text", 'synthesis'::"text", 'evaluation'::"text"])))
);


ALTER TABLE "public"."debrief_questions" OWNER TO "postgres";


COMMENT ON TABLE "public"."debrief_questions" IS 'Question bank for phase debriefs. AI selects 4–6 questions adaptively, always including is_required=TRUE questions. Questions are tagged by Bloom''s level to ensure coverage across cognitive depth.';



CREATE TABLE IF NOT EXISTS "public"."enterprise_ledger_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "enterprise_name" "text",
    "item_or_service" "text" NOT NULL,
    "buyer_description" "text",
    "amount" numeric,
    "unit" "text" DEFAULT 'NGN'::"text" NOT NULL,
    "entry_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "enterprise_ledger_entries_unit_check" CHECK (("unit" = ANY (ARRAY['NGN'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."enterprise_ledger_entries" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."enterprise_ledger_admin" AS
 SELECT "e"."id",
    "e"."user_id",
    "e"."enterprise_name",
    "e"."item_or_service",
    "e"."buyer_description",
    "e"."amount",
    "e"."unit",
    "e"."entry_date",
    "e"."notes",
    "e"."created_at",
    "p"."organization_id",
    "p"."name" AS "learner_name"
   FROM ("public"."enterprise_ledger_entries" "e"
     LEFT JOIN "public"."profiles" "p" ON (("p"."id" = "e"."user_id")));


ALTER TABLE "public"."enterprise_ledger_admin" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."entrepreneurship_client_summary" AS
SELECT
    NULL::"uuid" AS "id",
    NULL::"uuid" AS "youth_user_id",
    NULL::"text" AS "client_name",
    NULL::"text" AS "village",
    NULL::"text" AS "phone",
    NULL::"text" AS "business_type",
    NULL::"text" AS "business_stage",
    NULL::"text" AS "notes",
    NULL::timestamp with time zone AS "created_at",
    NULL::timestamp with time zone AS "updated_at",
    NULL::bigint AS "total_consultations",
    NULL::bigint AS "open_cases",
    NULL::timestamp with time zone AS "last_consultation_at";


ALTER TABLE "public"."entrepreneurship_client_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entrepreneurship_clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "youth_user_id" "uuid" NOT NULL,
    "client_name" "text" NOT NULL,
    "village" "text" NOT NULL,
    "phone" "text",
    "business_type" "text" NOT NULL,
    "business_stage" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."entrepreneurship_clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "function_name" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "user_id" "text",
    "cohort" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider" "text",
    CONSTRAINT "system_events_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'warning'::"text", 'error'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."system_events" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."fallback_daily_summary" AS
 SELECT "date"("system_events"."created_at") AS "log_date",
    ("system_events"."payload" ->> 'failed_provider'::"text") AS "failed_provider",
    ("system_events"."payload" ->> 'succeeded_provider'::"text") AS "succeeded_provider",
    "count"(*) AS "fallback_count"
   FROM "public"."system_events"
  WHERE ("system_events"."event_type" = 'provider_fallback'::"text")
  GROUP BY ("date"("system_events"."created_at")), ("system_events"."payload" ->> 'failed_provider'::"text"), ("system_events"."payload" ->> 'succeeded_provider'::"text")
  ORDER BY ("date"("system_events"."created_at")) DESC, ("count"(*)) DESC;


ALTER TABLE "public"."fallback_daily_summary" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."fishing_client_summary" AS
SELECT
    NULL::"uuid" AS "id",
    NULL::"uuid" AS "youth_user_id",
    NULL::"text" AS "client_name",
    NULL::"text" AS "village",
    NULL::"text" AS "phone",
    NULL::"jsonb" AS "activities",
    NULL::"jsonb" AS "waterways",
    NULL::"text" AS "notes",
    NULL::timestamp with time zone AS "created_at",
    NULL::timestamp with time zone AS "updated_at",
    NULL::bigint AS "total_consultations",
    NULL::bigint AS "open_cases",
    NULL::timestamp with time zone AS "last_consultation_at";


ALTER TABLE "public"."fishing_client_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fishing_clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "youth_user_id" "uuid" NOT NULL,
    "client_name" "text" NOT NULL,
    "village" "text" NOT NULL,
    "phone" "text",
    "activities" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "waterways" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fishing_clients" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."fishing_open_followups" AS
 SELECT "con"."id",
    "con"."youth_user_id",
    "c"."client_name",
    "c"."village",
    "con"."consultation_type",
    "con"."urgency_level",
    "con"."follow_up_date",
    "con"."follow_up_notes",
    "con"."created_at" AS "consultation_date"
   FROM ("public"."fishing_consultations" "con"
     JOIN "public"."fishing_clients" "c" ON (("c"."id" = "con"."client_id")))
  WHERE (("con"."follow_up_needed" = true) AND ("con"."resolved" = false))
  ORDER BY "con"."follow_up_date";


ALTER TABLE "public"."fishing_open_followups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."grand_challenge_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "learner_id" "uuid" NOT NULL,
    "org_id" "text" NOT NULL,
    "quarter" "text" NOT NULL,
    "title" "text" NOT NULL,
    "community_member_name" "text",
    "community_member_role" "text",
    "community_impact_slug" "text" NOT NULL,
    "impact_arc" "text" NOT NULL,
    "journal_entry_ids" "uuid"[],
    "journal_entry_count" integer DEFAULT 0 NOT NULL,
    "weeks_documented" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "submitted_at" timestamp with time zone,
    "evaluated_at" timestamp with time zone,
    "awarded_at" timestamp with time zone,
    "evaluation_json" "jsonb",
    "tier_awarded" "text",
    "is_quarter_winner" boolean DEFAULT false NOT NULL,
    "prize_description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "grand_challenge_submissions_community_member_role_check" CHECK (("community_member_role" = ANY (ARRAY['farmer'::"text", 'fisher'::"text", 'entrepreneur'::"text", 'family'::"text", 'health'::"text", 'animal-keeper'::"text", 'other'::"text"]))),
    CONSTRAINT "grand_challenge_submissions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'submitted'::"text", 'evaluated'::"text", 'awarded'::"text"]))),
    CONSTRAINT "grand_challenge_submissions_tier_awarded_check" CHECK (("tier_awarded" = ANY (ARRAY['seed'::"text", 'scout'::"text", 'bridge'::"text", 'builder'::"text", 'multiplier'::"text"])))
);


ALTER TABLE "public"."grand_challenge_submissions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."grand_challenge_leaderboard" AS
 WITH "tier_rank_map"("tier", "tier_rank") AS (
         VALUES ('seed'::"text",1), ('scout'::"text",2), ('bridge'::"text",3), ('builder'::"text",4), ('multiplier'::"text",5)
        )
 SELECT "g"."id",
    "g"."learner_id",
    "g"."org_id",
    "g"."quarter",
    "g"."title",
    "g"."community_member_name",
    "g"."community_impact_slug",
    "g"."journal_entry_count",
    "g"."weeks_documented",
    "g"."tier_awarded",
    "trm"."tier_rank",
    "g"."is_quarter_winner",
    "g"."status",
    "g"."submitted_at",
    "p"."name" AS "learner_name",
    "p"."avatar_url",
    "row_number"() OVER (PARTITION BY "g"."org_id", "g"."quarter" ORDER BY "trm"."tier_rank" DESC NULLS LAST, "g"."journal_entry_count" DESC, "g"."weeks_documented" DESC, "g"."submitted_at") AS "rank"
   FROM (("public"."grand_challenge_submissions" "g"
     LEFT JOIN "tier_rank_map" "trm" ON (("trm"."tier" = "g"."tier_awarded")))
     LEFT JOIN "public"."profiles" "p" ON (("p"."id" = "g"."learner_id")))
  WHERE ("g"."status" = ANY (ARRAY['submitted'::"text", 'evaluated'::"text", 'awarded'::"text"]));


ALTER TABLE "public"."grand_challenge_leaderboard" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."grand_challenge_quarters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quarter" "text" NOT NULL,
    "org_id" "text" DEFAULT 'all'::"text" NOT NULL,
    "start_date" "date" NOT NULL,
    "submission_deadline" "date" NOT NULL,
    "winner_announced_date" "date" NOT NULL,
    "active" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."grand_challenge_quarters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."health_patients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "youth_user_id" "uuid" NOT NULL,
    "patient_name" "text" NOT NULL,
    "village" "text" NOT NULL,
    "phone" "text",
    "age_years" integer,
    "age_months" integer,
    "sex" "text",
    "patient_group" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "health_patients_age_months_check" CHECK ((("age_months" >= 0) AND ("age_months" < 12))),
    CONSTRAINT "health_patients_age_years_check" CHECK (("age_years" >= 0)),
    CONSTRAINT "health_patients_patient_group_check" CHECK (("patient_group" = ANY (ARRAY['child-under-5'::"text", 'child-5-14'::"text", 'adult'::"text", 'pregnant'::"text", 'elderly'::"text"]))),
    CONSTRAINT "health_patients_sex_check" CHECK (("sex" = ANY (ARRAY['male'::"text", 'female'::"text"])))
);


ALTER TABLE "public"."health_patients" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."health_open_followups" AS
 SELECT "a"."id",
    "a"."youth_user_id",
    "p"."patient_name",
    "p"."village",
    "p"."patient_group",
    "a"."triage_level",
    "a"."follow_up_date",
    "a"."follow_up_notes",
    "a"."created_at" AS "assessment_date"
   FROM ("public"."health_assessments" "a"
     JOIN "public"."health_patients" "p" ON (("p"."id" = "a"."patient_id")))
  WHERE (("a"."follow_up_needed" = true) AND ("a"."resolved" = false))
  ORDER BY
        CASE "a"."triage_level"
            WHEN 'red'::"text" THEN 1
            WHEN 'yellow'::"text" THEN 2
            ELSE 3
        END, "a"."follow_up_date";


ALTER TABLE "public"."health_open_followups" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."health_patient_summary" AS
 SELECT "p"."id" AS "patient_id",
    "p"."youth_user_id",
    "p"."patient_name",
    "p"."village",
    "p"."phone",
    "p"."age_years",
    "p"."age_months",
    "p"."sex",
    "p"."patient_group",
    "p"."notes",
    "p"."created_at",
    "count"("a"."id") AS "total_assessments",
    "count"("a"."id") FILTER (WHERE ("a"."resolved" = false)) AS "open_cases",
    "count"("a"."id") FILTER (WHERE (("a"."triage_level" = 'red'::"text") AND ("a"."resolved" = false))) AS "open_red_cases",
    "max"("a"."created_at") AS "last_assessment_at"
   FROM ("public"."health_patients" "p"
     LEFT JOIN "public"."health_assessments" "a" ON (("a"."patient_id" = "p"."id")))
  GROUP BY "p"."id", "p"."youth_user_id", "p"."patient_name", "p"."village", "p"."phone", "p"."age_years", "p"."age_months", "p"."sex", "p"."patient_group", "p"."notes", "p"."created_at";


ALTER TABLE "public"."health_patient_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."image_generations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "prompt" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "image_url" "text",
    "saved_image_url" "text",
    "error_message" "text",
    "aspect_ratio" "text" DEFAULT '16:9'::"text",
    "steps" integer DEFAULT 4,
    "saved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."image_generations" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."learner_journal_summary" AS
 SELECT "j"."learner_id",
    "j"."org_id",
    "j"."community_impact_slug",
    ("count"(*))::integer AS "entry_count",
    "min"("j"."visit_date") AS "first_visit",
    "max"("j"."visit_date") AS "last_visit",
    ((EXTRACT(week FROM "max"("j"."visit_date")) - EXTRACT(week FROM "min"("j"."visit_date"))) + (1)::numeric) AS "weeks_active",
    ("count"(DISTINCT "j"."community_member_name"))::integer AS "unique_people_helped",
    "max"("j"."created_at") AS "last_entry_at"
   FROM "public"."community_impact_journal" "j"
  GROUP BY "j"."learner_id", "j"."org_id", "j"."community_impact_slug";


ALTER TABLE "public"."learner_journal_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learning_modules" (
    "learning_module_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text",
    "description" "text",
    "category" "text",
    "sub_category" "text",
    "outcomes" "text",
    "metrics_for_success" "text",
    "grade_level" bigint,
    "ai_facilitator_instructions" "text",
    "ai_assessment_instructions" "text",
    "youtube_link" "text",
    "youtube_description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "continent" "text" DEFAULT 'North America'::"text",
    "user_id" "uuid",
    "public" integer DEFAULT 0 NOT NULL,
    "application" smallint DEFAULT '0'::smallint,
    "learning_or_certification" "text" DEFAULT 'learning'::"text",
    "assessment_category" "text",
    "city_town" "text",
    "state" "text",
    "country" "text",
    CONSTRAINT "chk_learning_modules_public" CHECK (("public" = ANY (ARRAY[0, 1])))
);


ALTER TABLE "public"."learning_modules" OWNER TO "postgres";


COMMENT ON COLUMN "public"."learning_modules"."application" IS '0 = AIing and Vibing, 1 = Tech Workforce Dev';



CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "join_code" "text" NOT NULL,
    "leader_id" "uuid",
    "continent" "text",
    "country" "text",
    "state" "text",
    "city" "text",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "learner_age_min" integer,
    "learner_age_max" integer,
    "learner_gender" "text",
    "join_codes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "logo_url" "text",
    "community_livelihood" "text",
    "community_challenges" "text",
    "community_hopes" "text",
    "mentor_name" "text",
    "mentor_repo_url" "text",
    CONSTRAINT "organizations_learner_gender_check" CHECK (("learner_gender" = ANY (ARRAY['female'::"text", 'male'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."org_summary" AS
 SELECT "o"."id",
    "o"."name",
    "o"."join_code",
    "o"."continent",
    "o"."country",
    "o"."state",
    "o"."city",
    "o"."created_at",
    "p_leader"."name" AS "leader_name",
    "p_leader"."email" AS "leader_email",
    "count"("p_members"."id") FILTER (WHERE ("p_members"."role" <> ALL (ARRAY['leader'::"public"."user_role", 'platform_administrator'::"public"."user_role"]))) AS "learner_count",
    "count"("p_members"."id") FILTER (WHERE ("p_members"."updated_at" >= ("now"() - '7 days'::interval))) AS "active_7d",
    "count"("p_members"."id") FILTER (WHERE ("p_members"."updated_at" >= ("now"() - '30 days'::interval))) AS "active_30d"
   FROM (("public"."organizations" "o"
     LEFT JOIN "public"."profiles" "p_leader" ON (("p_leader"."id" = "o"."leader_id")))
     LEFT JOIN "public"."profiles" "p_members" ON (("p_members"."organization_id" = "o"."id")))
  GROUP BY "o"."id", "o"."name", "o"."join_code", "o"."continent", "o"."country", "o"."state", "o"."city", "o"."created_at", "p_leader"."name", "p_leader"."email";


ALTER TABLE "public"."org_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."phase_eligibility_thresholds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phase_id" "uuid" NOT NULL,
    "contribution_type" "text" NOT NULL,
    "min_count" integer DEFAULT 1 NOT NULL,
    "description" "text"
);


ALTER TABLE "public"."phase_eligibility_thresholds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_news" (
    "id" bigint NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "link" "text",
    "link_label" "text",
    "emoji" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_ids" "uuid"[],
    "organization_names" "text"[]
);


ALTER TABLE "public"."platform_news" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."platform_news_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."platform_news_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."platform_news_id_seq" OWNED BY "public"."platform_news"."id";



CREATE TABLE IF NOT EXISTS "public"."playground_context" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "chat_id" "text" NOT NULL,
    "filename" "text" NOT NULL,
    "content" "text" NOT NULL,
    "language" "text",
    "size_chars" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval)
);


ALTER TABLE "public"."playground_context" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "team_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "learning_module_id" "uuid",
    "status" "text" DEFAULT 'draft'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "projects_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'in_progress'::"text", 'completed'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."provider_health_24h" AS
 SELECT "system_events"."provider",
    "system_events"."event_type",
    "system_events"."severity",
    "count"(*) AS "event_count",
    "min"("system_events"."created_at") AS "first_seen",
    "max"("system_events"."created_at") AS "last_seen"
   FROM "public"."system_events"
  WHERE (("system_events"."created_at" > ("now"() - '24:00:00'::interval)) AND ("system_events"."provider" IS NOT NULL))
  GROUP BY "system_events"."provider", "system_events"."event_type", "system_events"."severity"
  ORDER BY ("count"(*)) DESC;


ALTER TABLE "public"."provider_health_24h" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."research_ai_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "site" "text" NOT NULL,
    "messages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "draft_texts_used" integer DEFAULT 0 NOT NULL,
    "session_duration_sec" integer,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_active_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."research_ai_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."research_badges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "phase_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "badge_name" "text" NOT NULL,
    "site" "text" NOT NULL,
    "issued_by" "text" DEFAULT 'University of Dayton'::"text" NOT NULL,
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ob3_json" "jsonb",
    "verified" boolean DEFAULT false NOT NULL,
    "verified_by" "uuid",
    "study_id" "uuid"
);


ALTER TABLE "public"."research_badges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."research_board_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."research_board_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."research_findings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "site" "text" NOT NULL,
    "content" "text" NOT NULL,
    "word_count" integer GENERATED ALWAYS AS ("array_length"("string_to_array"(TRIM(BOTH FROM "content"), ' '::"text"), 1)) STORED,
    "ai_assisted" boolean DEFAULT false NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."research_findings" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."research_findings_latest" AS
 SELECT DISTINCT ON ("research_findings"."task_id", "research_findings"."user_id") "research_findings"."id",
    "research_findings"."task_id",
    "research_findings"."team_id",
    "research_findings"."user_id",
    "research_findings"."site",
    "research_findings"."content",
    "research_findings"."word_count",
    "research_findings"."ai_assisted",
    "research_findings"."version",
    "research_findings"."created_at"
   FROM "public"."research_findings"
  ORDER BY "research_findings"."task_id", "research_findings"."user_id", "research_findings"."version" DESC;


ALTER TABLE "public"."research_findings_latest" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."research_guiding_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "short_title" "text",
    "domain" "text",
    "research_question" "text" NOT NULL,
    "icon" "text",
    "color_hex" "text",
    "sites" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."research_guiding_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."research_phases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "phase_number" integer NOT NULL,
    "name" "text" NOT NULL,
    "months_label" "text" NOT NULL,
    "badge_name" "text" NOT NULL,
    "status" "text" DEFAULT 'locked'::"text" NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "study_id" "uuid",
    "slug" "text",
    "title" "text",
    "description" "text",
    "safety_note" "text",
    "badge_title" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    CONSTRAINT "research_phases_phase_number_check" CHECK (("phase_number" >= 0)),
    CONSTRAINT "research_phases_status_check" CHECK (("status" = ANY (ARRAY['locked'::"text", 'active'::"text", 'complete'::"text"])))
);


ALTER TABLE "public"."research_phases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."research_platform_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site" "text" NOT NULL,
    "snapshot_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "total_sessions" integer DEFAULT 0 NOT NULL,
    "active_learners" integer DEFAULT 0 NOT NULL,
    "avg_proficiency" numeric(4,2),
    "proficiency_data" "jsonb",
    "survey_count" integer DEFAULT 0 NOT NULL,
    "top_learners" "jsonb",
    "raw_snapshot" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."research_platform_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."research_programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "sites" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "submitted_by" "uuid",
    "ai_review" "text",
    CONSTRAINT "research_programs_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending_review'::"text", 'approved'::"text", 'active'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."research_programs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."research_studies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "short_title" "text" NOT NULL,
    "domain" "text" NOT NULL,
    "research_question" "text" NOT NULL,
    "icon" "text",
    "color_hex" "text" DEFAULT '#C8963E'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sites" "text"[] DEFAULT '{Oloibiri,Ibiade}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "question_id" "uuid",
    "description" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "site" "text",
    "cohort_size" integer
);


ALTER TABLE "public"."research_studies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."research_task_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "completion_pct" integer DEFAULT 0 NOT NULL,
    "validated" boolean DEFAULT false NOT NULL,
    "validated_by" "uuid",
    "validated_at" timestamp with time zone,
    "notes" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "research_task_progress_completion_pct_check" CHECK ((("completion_pct" >= 0) AND ("completion_pct" <= 100)))
);


ALTER TABLE "public"."research_task_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."research_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phase_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "validation_required" "text" NOT NULL,
    "due_label" "text" NOT NULL,
    "status" "text" DEFAULT 'locked'::"text" NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "research_tasks_status_check" CHECK (("status" = ANY (ARRAY['locked'::"text", 'pending'::"text", 'active'::"text", 'complete'::"text"])))
);


ALTER TABLE "public"."research_tasks" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."research_task_tree" AS
 SELECT "rpr"."id" AS "project_id",
    "rpr"."slug" AS "project_slug",
    "rpr"."title" AS "project_title",
    "rpr"."color_hex",
    "rph"."id" AS "phase_id",
    "rph"."phase_number",
    "rph"."name" AS "phase_name",
    "rph"."status" AS "phase_status",
    "rph"."badge_name",
    "rt"."id" AS "task_id",
    "rt"."name" AS "task_name",
    "rt"."status" AS "task_status",
    "rt"."validation_required",
    "rt"."due_label",
    "rt"."display_order"
   FROM (("public"."research_studies" "rpr"
     JOIN "public"."research_phases" "rph" ON (("rph"."project_id" = "rpr"."id")))
     JOIN "public"."research_tasks" "rt" ON (("rt"."phase_id" = "rph"."id")))
  ORDER BY "rpr"."title", "rph"."phase_number", "rt"."display_order";


ALTER TABLE "public"."research_task_tree" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."research_team_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "role" "text" DEFAULT 'researcher'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    CONSTRAINT "research_team_members_role_check" CHECK (("role" = ANY (ARRAY['researcher'::"text", 'lead'::"text", 'mentor'::"text", 'observer'::"text"])))
);


ALTER TABLE "public"."research_team_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."research_teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "site" "text" NOT NULL,
    "team_name" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "study_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    CONSTRAINT "research_teams_site_check" CHECK (("site" = ANY (ARRAY['Oloibiri'::"text", 'Ibiade'::"text", 'Lagos'::"text", 'Accra'::"text", 'Kigali'::"text", 'Dar es Salaam'::"text"])))
);


ALTER TABLE "public"."research_teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."researcher_contribution_summary" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "phase_id" "uuid" NOT NULL,
    "site" "text" NOT NULL,
    "findings_submitted" integer DEFAULT 0 NOT NULL,
    "interviews_conducted" integer DEFAULT 0 NOT NULL,
    "surveys_administered" integer DEFAULT 0 NOT NULL,
    "observations_logged" integer DEFAULT 0 NOT NULL,
    "reflexivity_entries" integer DEFAULT 0 NOT NULL,
    "peer_reviews_given" integer DEFAULT 0 NOT NULL,
    "ai_sessions_completed" integer DEFAULT 0 NOT NULL,
    "draft_texts_used" integer DEFAULT 0 NOT NULL,
    "portfolio_items_added" integer DEFAULT 0 NOT NULL,
    "total_contribution_score" numeric(8,2) DEFAULT 0 NOT NULL,
    "last_updated" timestamp with time zone DEFAULT "now"() NOT NULL,
    "study_id" "uuid"
);


ALTER TABLE "public"."researcher_contribution_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."researcher_contributions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "phase_id" "uuid" NOT NULL,
    "task_id" "uuid",
    "site" "text" NOT NULL,
    "contribution_type" "text" NOT NULL,
    "weight" numeric(5,2) DEFAULT 1.0 NOT NULL,
    "source_table" "text",
    "source_id" "uuid",
    "description" "text",
    "evidence_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "study_id" "uuid",
    CONSTRAINT "researcher_contributions_contribution_type_check" CHECK (("contribution_type" = ANY (ARRAY['finding_submitted'::"text", 'interview_conducted'::"text", 'survey_administered'::"text", 'observation_logged'::"text", 'reflexivity_entry'::"text", 'peer_review_given'::"text", 'literature_annotated'::"text", 'data_coded'::"text", 'draft_text_used'::"text", 'ai_session_completed'::"text", 'community_presentation'::"text", 'portfolio_item_added'::"text"])))
);


ALTER TABLE "public"."researcher_contributions" OWNER TO "postgres";


COMMENT ON TABLE "public"."researcher_contributions" IS 'Append-only event ledger of individual researcher actions. Never modified after insert. Visible only to the researcher and faculty — not ranked among teammates.';



CREATE TABLE IF NOT EXISTS "public"."researcher_phase_debriefs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "phase_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "site" "text" NOT NULL,
    "status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "messages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "responses" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ai_score" numeric(4,2),
    "ai_score_notes" "text",
    "faculty_score" numeric(4,2),
    "faculty_notes" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "final_score" numeric(4,2) GENERATED ALWAYS AS (COALESCE("faculty_score", "ai_score")) STORED,
    "started_at" timestamp with time zone,
    "submitted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "study_id" "uuid",
    CONSTRAINT "researcher_phase_debriefs_status_check" CHECK (("status" = ANY (ARRAY['not_started'::"text", 'eligible'::"text", 'in_progress'::"text", 'submitted'::"text", 'approved'::"text", 'needs_revision'::"text"])))
);


ALTER TABLE "public"."researcher_phase_debriefs" OWNER TO "postgres";


COMMENT ON TABLE "public"."researcher_phase_debriefs" IS 'AI-administered conversational assessment after each phase. AI scores 0–3 (UNESCO scale); faculty can override. Debrief approval is required before badge issuance.';



CREATE OR REPLACE VIEW "public"."researcher_credential_eligibility" AS
 SELECT "rcs"."user_id",
    "rcs"."project_id",
    "rcs"."phase_id",
    "rcs"."site",
    "rph"."phase_number",
    "rph"."name" AS "phase_name",
    "rph"."badge_name",
    "rcs"."findings_submitted",
    "rcs"."interviews_conducted",
    "rcs"."observations_logged",
    "rcs"."reflexivity_entries",
    "rcs"."peer_reviews_given",
    "rcs"."ai_sessions_completed",
    "rcs"."portfolio_items_added",
    "rcs"."total_contribution_score",
    ( SELECT "count"(*) AS "count"
           FROM "public"."phase_eligibility_thresholds" "pet"
          WHERE (("pet"."phase_id" = "rcs"."phase_id") AND ((("pet"."contribution_type" = 'finding_submitted'::"text") AND ("rcs"."findings_submitted" >= "pet"."min_count")) OR (("pet"."contribution_type" = 'interview_conducted'::"text") AND ("rcs"."interviews_conducted" >= "pet"."min_count")) OR (("pet"."contribution_type" = 'observation_logged'::"text") AND ("rcs"."observations_logged" >= "pet"."min_count")) OR (("pet"."contribution_type" = 'reflexivity_entry'::"text") AND ("rcs"."reflexivity_entries" >= "pet"."min_count")) OR (("pet"."contribution_type" = 'peer_review_given'::"text") AND ("rcs"."peer_reviews_given" >= "pet"."min_count")) OR (("pet"."contribution_type" = 'ai_session_completed'::"text") AND ("rcs"."ai_sessions_completed" >= "pet"."min_count")) OR (("pet"."contribution_type" = 'portfolio_item_added'::"text") AND ("rcs"."portfolio_items_added" >= "pet"."min_count"))))) AS "thresholds_met",
    ( SELECT "count"(*) AS "count"
           FROM "public"."phase_eligibility_thresholds"
          WHERE ("phase_eligibility_thresholds"."phase_id" = "rcs"."phase_id")) AS "thresholds_total",
    "rpd"."status" AS "debrief_status",
    "rpd"."final_score" AS "debrief_score",
    "rpd"."submitted_at" AS "debrief_submitted_at",
    "rpd"."reviewed_at" AS "debrief_reviewed_at",
    "rb"."issued_at" AS "badge_issued_at",
    "rb"."verified" AS "badge_verified",
    ((( SELECT "count"(*) AS "count"
           FROM "public"."phase_eligibility_thresholds" "pet2"
          WHERE (("pet2"."phase_id" = "rcs"."phase_id") AND ((("pet2"."contribution_type" = 'finding_submitted'::"text") AND ("rcs"."findings_submitted" >= "pet2"."min_count")) OR (("pet2"."contribution_type" = 'interview_conducted'::"text") AND ("rcs"."interviews_conducted" >= "pet2"."min_count")) OR (("pet2"."contribution_type" = 'observation_logged'::"text") AND ("rcs"."observations_logged" >= "pet2"."min_count")) OR (("pet2"."contribution_type" = 'reflexivity_entry'::"text") AND ("rcs"."reflexivity_entries" >= "pet2"."min_count")) OR (("pet2"."contribution_type" = 'peer_review_given'::"text") AND ("rcs"."peer_reviews_given" >= "pet2"."min_count")) OR (("pet2"."contribution_type" = 'ai_session_completed'::"text") AND ("rcs"."ai_sessions_completed" >= "pet2"."min_count")) OR (("pet2"."contribution_type" = 'portfolio_item_added'::"text") AND ("rcs"."portfolio_items_added" >= "pet2"."min_count"))))) = ( SELECT "count"(*) AS "count"
           FROM "public"."phase_eligibility_thresholds"
          WHERE ("phase_eligibility_thresholds"."phase_id" = "rcs"."phase_id"))) AND ("rpd"."status" = 'approved'::"text") AND ("rb"."id" IS NULL)) AS "ready_to_badge"
   FROM ((("public"."researcher_contribution_summary" "rcs"
     JOIN "public"."research_phases" "rph" ON (("rph"."id" = "rcs"."phase_id")))
     LEFT JOIN "public"."researcher_phase_debriefs" "rpd" ON ((("rpd"."user_id" = "rcs"."user_id") AND ("rpd"."phase_id" = "rcs"."phase_id"))))
     LEFT JOIN "public"."research_badges" "rb" ON ((("rb"."user_id" = "rcs"."user_id") AND ("rb"."phase_id" = "rcs"."phase_id"))));


ALTER TABLE "public"."researcher_credential_eligibility" OWNER TO "postgres";


COMMENT ON VIEW "public"."researcher_credential_eligibility" IS 'Live eligibility check: thresholds_met = thresholds_total AND debrief approved → ready_to_badge = TRUE. Badge Edge Function queries this view to auto-trigger issuance.';



CREATE OR REPLACE VIEW "public"."researcher_dashboard" AS
 SELECT "rtm"."user_id",
    "rtm"."display_name",
    "rt2"."site",
    "rpr"."title" AS "project_title",
    "rpr"."slug" AS "project_slug",
    "rph"."phase_number",
    "rph"."name" AS "phase_name",
    "rph"."status" AS "phase_status",
    "rph"."badge_name",
    "rb"."issued_at" AS "badge_issued_at",
    "rb"."verified" AS "badge_verified"
   FROM (((("public"."research_team_members" "rtm"
     JOIN "public"."research_teams" "rt2" ON (("rt2"."id" = "rtm"."team_id")))
     JOIN "public"."research_studies" "rpr" ON (("rpr"."id" = "rt2"."project_id")))
     JOIN "public"."research_phases" "rph" ON (("rph"."project_id" = "rpr"."id")))
     LEFT JOIN "public"."research_badges" "rb" ON ((("rb"."user_id" = "rtm"."user_id") AND ("rb"."phase_id" = "rph"."id"))))
  WHERE ("rtm"."is_active" = true)
  ORDER BY "rtm"."user_id", "rpr"."title", "rph"."phase_number";


ALTER TABLE "public"."researcher_dashboard" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."researcher_portfolios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "phase_id" "uuid" NOT NULL,
    "site" "text" NOT NULL,
    "artifact_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "file_url" "text",
    "finding_id" "uuid",
    "is_sole_author" boolean DEFAULT true NOT NULL,
    "co_authors" "uuid"[],
    "reviewed" boolean DEFAULT false NOT NULL,
    "reviewer_notes" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "study_id" "uuid",
    CONSTRAINT "researcher_portfolios_artifact_type_check" CHECK (("artifact_type" = ANY (ARRAY['research_protocol'::"text", 'survey_instrument'::"text", 'interview_transcript'::"text", 'observation_log'::"text", 'reflexivity_journal'::"text", 'coded_data'::"text", 'analysis_output'::"text", 'draft_manuscript'::"text", 'policy_brief'::"text", 'peer_review'::"text", 'community_presentation'::"text", 'researcher_reflection'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."researcher_portfolios" OWNER TO "postgres";


COMMENT ON TABLE "public"."researcher_portfolios" IS 'Individual artifact collection built across all phases. Supports co-authorship attribution. Referenced by the UD Open Badges 3.0 credential assertion at Phase 5 completion.';



CREATE TABLE IF NOT EXISTS "public"."site_mentor_presence" (
    "site" "text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "mentor_present" boolean DEFAULT true NOT NULL,
    "notes" "text"
);


ALTER TABLE "public"."site_mentor_presence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid",
    "user_id" "uuid",
    "added_at" timestamp without time zone DEFAULT "now"(),
    "roles" "text"[]
);


ALTER TABLE "public"."team_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "created_by" "uuid",
    "team_code" character varying(5) NOT NULL,
    "organization_id" "uuid"
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tech_skills_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "phase_id" "text" NOT NULL,
    "track_label" "text" NOT NULL,
    "task_name" "text" NOT NULL,
    "status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "submission_text" "text",
    "ai_feedback" "text",
    "ai_score" smallint,
    "attempt_count" smallint DEFAULT 0,
    "submitted_at" timestamp with time zone,
    "evaluated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "tech_skills_progress_ai_score_check" CHECK (("ai_score" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "tech_skills_progress_status_check" CHECK (("status" = ANY (ARRAY['not_started'::"text", 'submitted'::"text", 'pass'::"text", 'needs_work'::"text"])))
);


ALTER TABLE "public"."tech_skills_progress" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."tech_skills_progress_admin" AS
 SELECT "s"."user_id",
    "p"."organization_id",
    "p"."name" AS "learner_name",
    "s"."phase_id",
    "s"."track_label",
    "s"."task_name",
    "s"."status",
    "s"."ai_score",
    "s"."attempt_count",
    "s"."submitted_at",
    "s"."evaluated_at"
   FROM ("public"."tech_skills_progress" "s"
     LEFT JOIN "public"."profiles" "p" ON (("p"."id" = "s"."user_id")));


ALTER TABLE "public"."tech_skills_progress_admin" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."triage_dedup" (
    "dedup_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."triage_dedup" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_monthly_assessments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "measured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cognitive_score" numeric(5,2),
    "cognitive_evidence" "jsonb",
    "critical_thinking_score" numeric(5,2),
    "critical_thinking_evidence" "jsonb",
    "problem_solving_score" numeric(5,2),
    "problem_solving_evidence" "jsonb",
    "creativity_score" numeric(5,2),
    "creativity_evidence" "jsonb",
    "pue_score" numeric(5,2),
    "pue_evidence" "jsonb",
    "assessment_model" "text" DEFAULT 'gpt-4o'::"text",
    "assessment_version" "text" DEFAULT 'v1.0'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "session_count" integer DEFAULT 0,
    "engaged_session_count" integer DEFAULT 0,
    "avg_words_per_session" numeric(6,1),
    "pue_energy_constraint_pct" numeric(5,1),
    "pue_market_pricing_pct" numeric(5,1),
    "pue_battery_load_pct" numeric(5,1),
    "pue_enterprise_planning_pct" numeric(5,1),
    "pue_learner_initiated_pct" numeric(5,1),
    "pue_ai_introduced_pct" numeric(5,1),
    "pue_multi_domain_pct" numeric(5,1),
    "pue_local_context_pct" numeric(5,1),
    "pue_summary" "text",
    "scaffold_clarification_per_session" numeric(6,2),
    "scaffold_decomposition_per_session" numeric(6,2),
    "scaffold_correction_total_per_session" numeric(6,2),
    "scaffold_explicit_correction_per_session" numeric(6,2),
    "scaffold_gentle_redirect_per_session" numeric(6,2),
    "scaffold_consecutive_correction_runs" numeric(6,2),
    "scaffold_convergence_trend" "text",
    "scaffold_convergence_narrative" "text",
    "reasoning_definitional_pct" numeric(5,1),
    "reasoning_responsive_pct" numeric(5,1),
    "reasoning_elaborative_pct" numeric(5,1),
    "reasoning_structured_pct" numeric(5,1),
    "reasoning_chain_count" integer DEFAULT 0,
    "metacog_verification_rate" numeric(6,2),
    "metacog_reactive_rate" numeric(6,2),
    "metacog_strategic_rate" numeric(6,2),
    "metacog_narrative" "text",
    "role_teaching_intent_count" integer DEFAULT 0,
    "role_community_application_count" integer DEFAULT 0,
    "role_enterprise_orientation_count" integer DEFAULT 0,
    "role_intergenerational_count" integer DEFAULT 0,
    "role_readiness_narrative" "text",
    "role_readiness_signals" "text"[],
    "enterprise_artifact_score" numeric(4,1),
    "enterprise_artifact_goal_score" smallint,
    "enterprise_artifact_resource_score" smallint,
    "enterprise_artifact_plan_score" smallint,
    "enterprise_artifact_constraint_score" smallint,
    "enterprise_artifact_quant_score" smallint,
    "enterprise_artifact_risk_score" smallint,
    "enterprise_artifact_evidence" "text"[],
    "ai_playground_session_count" integer DEFAULT 0,
    "ai_playground_word_count" integer DEFAULT 0,
    "ai_playground_summary" "text",
    "ai_prof_application_score" smallint,
    "ai_prof_ethics_score" smallint,
    "ai_prof_understanding_score" smallint,
    "ai_prof_verification_score" smallint,
    "ai_prof_min_score" smallint,
    "ai_prof_cert_level" "text",
    "ai_prof_application_gpt" numeric(5,1),
    "ai_prof_ethics_gpt" numeric(5,1),
    "ai_prof_understanding_gpt" numeric(5,1),
    "ai_prof_verification_gpt" numeric(5,1),
    "ai_prof_gpt_narrative" "text",
    "cert_attempted_count" integer DEFAULT 0,
    "cert_passed_count" integer DEFAULT 0,
    "cert_names_attempted" "text"[],
    "cert_names_passed" "text"[],
    "cert_avg_score" numeric(4,2),
    "cert_summary" "text",
    "ci_training_sessions_total" integer DEFAULT 0,
    "ci_training_sessions_by_track" "jsonb",
    "ci_training_eval_by_track" "jsonb",
    "ci_tracks_active_count" integer DEFAULT 0,
    "ci_cert_by_track" "jsonb",
    "ci_certs_passed_count" integer DEFAULT 0,
    "ci_summary" "text",
    "enterprise_planning_total" numeric,
    "scaffold_narrative" "text",
    "pue_source_split" "text",
    "reasoning_level_0" numeric,
    "reasoning_level_1" numeric,
    "reasoning_level_2" numeric,
    "reasoning_level_3" numeric,
    "peer_diffusion_signal" integer,
    "role_readiness_signal" integer,
    "metacog_markers" "jsonb",
    "pue_metrics" "jsonb"
);


ALTER TABLE "public"."user_monthly_assessments" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_monthly_assessments" IS 'Monthly AI-scored capability assessment per learner. Covers: 5 core skill dimensions, PUE linkage across 7 domain metrics, scaffolding convergence, 4-level reasoning distribution, metacognitive markers, role-readiness signals, and enterprise artifact rubric.';



COMMENT ON COLUMN "public"."user_monthly_assessments"."ai_playground_session_count" IS 'Number of ai_playground_chats sessions active in this assessment period';



COMMENT ON COLUMN "public"."user_monthly_assessments"."ai_playground_word_count" IS 'Total learner words across playground sessions in this period';



COMMENT ON COLUMN "public"."user_monthly_assessments"."ai_playground_summary" IS 'AI narrative: how the learner used unconstrained AI Playground access — topics explored, PUE/entrepreneurship signals, contrast with structured curriculum';



CREATE TABLE IF NOT EXISTS "public"."user_personality_baseline" (
    "user_id" "uuid" NOT NULL,
    "measured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "openness_score" numeric(5,2),
    "conscientiousness_score" numeric(5,2),
    "extraversion_score" numeric(5,2),
    "agreeableness_score" numeric(5,2),
    "neuroticism_score" numeric(5,2),
    "openness_evidence" "jsonb",
    "conscientiousness_evidence" "jsonb",
    "extraversion_evidence" "jsonb",
    "agreeableness_evidence" "jsonb",
    "neuroticism_evidence" "jsonb",
    "communication_strategy" "jsonb",
    "learning_strategy" "jsonb",
    "assessment_model" "text" DEFAULT 'gpt-4o'::"text",
    "assessment_version" "text" DEFAULT 'v1.0'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "communication_level" smallint DEFAULT '0'::smallint
);


ALTER TABLE "public"."user_personality_baseline" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_event_frequency" AS
 SELECT "system_events"."function_name",
    "system_events"."event_type",
    "system_events"."severity",
    "count"(*) AS "occurrences",
    "max"("system_events"."created_at") AS "last_seen",
    "min"("system_events"."created_at") AS "first_seen"
   FROM "public"."system_events"
  WHERE ("system_events"."created_at" > ("now"() - '24:00:00'::interval))
  GROUP BY "system_events"."function_name", "system_events"."event_type", "system_events"."severity"
  ORDER BY ("count"(*)) DESC;


ALTER TABLE "public"."v_event_frequency" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_recent_errors" AS
 SELECT "system_events"."function_name",
    "system_events"."event_type",
    "system_events"."severity",
    "system_events"."cohort",
    "system_events"."payload",
    "system_events"."created_at"
   FROM "public"."system_events"
  WHERE (("system_events"."severity" = ANY (ARRAY['error'::"text", 'critical'::"text"])) AND ("system_events"."created_at" > ("now"() - '24:00:00'::interval)))
  ORDER BY "system_events"."created_at" DESC;


ALTER TABLE "public"."v_recent_errors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vibe_coding_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "chat_history" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "vibe_prompt" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vibe_coding_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_generations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "prompt" "text" NOT NULL,
    "replicate_id" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "video_url" "text",
    "error_message" "text",
    "width" integer DEFAULT 704,
    "height" integer DEFAULT 480,
    "num_frames" integer DEFAULT 121,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "saved_video_url" "text",
    "saved_at" timestamp with time zone,
    "thumbnail_url" "text"
);


ALTER TABLE "public"."video_generations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."video_generations"."thumbnail_url" IS 'Signed URL to JPEG thumbnail stored in ai-videos/{userId}/{jobId}_thumb.jpg';



CREATE TABLE IF NOT EXISTS "public"."video_studio_projects" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'Untitled Project'::"text" NOT NULL,
    "project_url" "text",
    "thumbnail_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "storage_path" "text",
    "project_data" "jsonb"
);


ALTER TABLE "public"."video_studio_projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."voice_generations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "script" "text" NOT NULL,
    "voice_id" "text" NOT NULL,
    "emotion" "text" DEFAULT 'neutral'::"text",
    "speed" numeric DEFAULT 1.0,
    "status" "text" DEFAULT 'succeeded'::"text" NOT NULL,
    "audio_url" "text",
    "saved_audio_url" "text",
    "saved_at" timestamp with time zone,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "replicate_id" "text"
);


ALTER TABLE "public"."voice_generations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_challenge_projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'draft'::"text",
    "team_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "weekly_challenge_projects_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'in_progress'::"text", 'completed'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."weekly_challenge_projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_champions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "text" NOT NULL,
    "week_start" "date" NOT NULL,
    "week_end" "date" NOT NULL,
    "champion_user_id" "uuid" NOT NULL,
    "champion_name" "text" NOT NULL,
    "winning_tier" "text" NOT NULL,
    "winning_tier_label" "text" NOT NULL,
    "was_tiebreak" boolean DEFAULT false NOT NULL,
    "tiebreak_reasoning" "text",
    "tied_learner_count" integer,
    "announced" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "champion_story" "text"
);


ALTER TABLE "public"."weekly_champions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."platform_news" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."platform_news_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."agent_conversations"
    ADD CONSTRAINT "agent_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_messages"
    ADD CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_share_token_key" UNIQUE ("share_token");



ALTER TABLE ONLY "public"."agriculture_consultations"
    ADD CONSTRAINT "agriculture_consultations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agriculture_farmers"
    ADD CONSTRAINT "agriculture_farmers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_playground_chats"
    ADD CONSTRAINT "ai_playground_chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."animal_husbandry_consultations"
    ADD CONSTRAINT "animal_husbandry_consultations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."animal_husbandry_farmers"
    ADD CONSTRAINT "animal_husbandry_farmers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_cost_log"
    ADD CONSTRAINT "api_cost_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessments_monthly_global"
    ADD CONSTRAINT "assessments_monthly_global_period_start_organization_id_key" UNIQUE ("period_start", "organization_id");



ALTER TABLE ONLY "public"."assessments_monthly_global"
    ADD CONSTRAINT "assessments_monthly_global_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."certification_assessments"
    ADD CONSTRAINT "certification_assessments_pkey" PRIMARY KEY ("certification_id");



ALTER TABLE ONLY "public"."certification_assessments"
    ADD CONSTRAINT "certification_assessments_unique" UNIQUE ("certification_name", "assessment_name");



ALTER TABLE ONLY "public"."challenge_enrollments"
    ADD CONSTRAINT "challenge_enrollments_learner_id_challenge_id_key" UNIQUE ("learner_id", "challenge_id");



ALTER TABLE ONLY "public"."challenge_enrollments"
    ADD CONSTRAINT "challenge_enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_challenges"
    ADD CONSTRAINT "community_challenges_org_id_week_start_key" UNIQUE ("org_id", "week_start");



ALTER TABLE ONLY "public"."community_challenges"
    ADD CONSTRAINT "community_challenges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_impact_journal"
    ADD CONSTRAINT "community_impact_journal_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_impact_tiers"
    ADD CONSTRAINT "community_impact_tiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consultation_evidence_links"
    ADD CONSTRAINT "consultation_evidence_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consultation_evidence_links"
    ADD CONSTRAINT "consultation_evidence_links_source_type_source_id_consultat_key" UNIQUE ("source_type", "source_id", "consultation_domain", "consultation_id");



ALTER TABLE ONLY "public"."daily_activity_log"
    ADD CONSTRAINT "daily_activity_log_log_date_city_key" UNIQUE ("log_date", "city");



ALTER TABLE ONLY "public"."daily_activity_log"
    ADD CONSTRAINT "daily_activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_reflections"
    ADD CONSTRAINT "daily_reflections_one_per_day" UNIQUE ("user_id", "reflection_date");



ALTER TABLE ONLY "public"."daily_reflections"
    ADD CONSTRAINT "daily_reflections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dashboard"
    ADD CONSTRAINT "dashboard_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dashboard_stats"
    ADD CONSTRAINT "dashboard_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dashboard_stats"
    ADD CONSTRAINT "dashboard_stats_unique_row" UNIQUE ("activity_date", "learner_token", "site");



ALTER TABLE ONLY "public"."dashboard"
    ADD CONSTRAINT "dashboard_user_module_unique" UNIQUE ("user_id", "learning_module_id");



ALTER TABLE ONLY "public"."debrief_questions"
    ADD CONSTRAINT "debrief_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enterprise_ledger_entries"
    ADD CONSTRAINT "enterprise_ledger_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entrepreneurship_clients"
    ADD CONSTRAINT "entrepreneurship_clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entrepreneurship_consultations"
    ADD CONSTRAINT "entrepreneurship_consultations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fishing_clients"
    ADD CONSTRAINT "fishing_clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fishing_consultations"
    ADD CONSTRAINT "fishing_consultations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."grand_challenge_quarters"
    ADD CONSTRAINT "grand_challenge_quarters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."grand_challenge_quarters"
    ADD CONSTRAINT "grand_challenge_quarters_quarter_key" UNIQUE ("quarter");



ALTER TABLE ONLY "public"."grand_challenge_submissions"
    ADD CONSTRAINT "grand_challenge_submissions_learner_id_org_id_quarter_key" UNIQUE ("learner_id", "org_id", "quarter");



ALTER TABLE ONLY "public"."grand_challenge_submissions"
    ADD CONSTRAINT "grand_challenge_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."health_assessments"
    ADD CONSTRAINT "health_assessments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."health_patients"
    ADD CONSTRAINT "health_patients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."image_generations"
    ADD CONSTRAINT "image_generations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_join_code_key" UNIQUE ("join_code");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."phase_eligibility_thresholds"
    ADD CONSTRAINT "phase_eligibility_thresholds_phase_id_contribution_type_key" UNIQUE ("phase_id", "contribution_type");



ALTER TABLE ONLY "public"."phase_eligibility_thresholds"
    ADD CONSTRAINT "phase_eligibility_thresholds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_modules"
    ADD CONSTRAINT "pk_learning_modules" PRIMARY KEY ("learning_module_id");



ALTER TABLE ONLY "public"."platform_news"
    ADD CONSTRAINT "platform_news_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."playground_context"
    ADD CONSTRAINT "playground_context_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."playground_context"
    ADD CONSTRAINT "playground_context_user_chat_filename_key" UNIQUE ("user_id", "chat_id", "filename");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."research_ai_sessions"
    ADD CONSTRAINT "research_ai_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."research_badges"
    ADD CONSTRAINT "research_badges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."research_badges"
    ADD CONSTRAINT "research_badges_user_id_phase_id_key" UNIQUE ("user_id", "phase_id");



ALTER TABLE ONLY "public"."research_board_members"
    ADD CONSTRAINT "research_board_members_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."research_board_members"
    ADD CONSTRAINT "research_board_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."research_findings"
    ADD CONSTRAINT "research_findings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."research_guiding_questions"
    ADD CONSTRAINT "research_guiding_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."research_guiding_questions"
    ADD CONSTRAINT "research_guiding_questions_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."research_phases"
    ADD CONSTRAINT "research_phases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."research_phases"
    ADD CONSTRAINT "research_phases_project_id_phase_number_key" UNIQUE ("project_id", "phase_number");



ALTER TABLE ONLY "public"."research_phases"
    ADD CONSTRAINT "research_phases_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."research_platform_snapshots"
    ADD CONSTRAINT "research_platform_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."research_platform_snapshots"
    ADD CONSTRAINT "research_platform_snapshots_site_snapshot_date_key" UNIQUE ("site", "snapshot_date");



ALTER TABLE ONLY "public"."research_programs"
    ADD CONSTRAINT "research_programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."research_programs"
    ADD CONSTRAINT "research_programs_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."research_studies"
    ADD CONSTRAINT "research_projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."research_studies"
    ADD CONSTRAINT "research_projects_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."research_task_progress"
    ADD CONSTRAINT "research_task_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."research_task_progress"
    ADD CONSTRAINT "research_task_progress_task_id_team_id_key" UNIQUE ("task_id", "team_id");



ALTER TABLE ONLY "public"."research_tasks"
    ADD CONSTRAINT "research_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."research_team_members"
    ADD CONSTRAINT "research_team_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."research_team_members"
    ADD CONSTRAINT "research_team_members_team_id_user_id_key" UNIQUE ("team_id", "user_id");



ALTER TABLE ONLY "public"."research_teams"
    ADD CONSTRAINT "research_teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."research_teams"
    ADD CONSTRAINT "research_teams_project_id_site_created_by_key" UNIQUE ("project_id", "site", "created_by");



ALTER TABLE ONLY "public"."researcher_contribution_summary"
    ADD CONSTRAINT "researcher_contribution_summary_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."researcher_contribution_summary"
    ADD CONSTRAINT "researcher_contribution_summary_user_id_phase_id_key" UNIQUE ("user_id", "phase_id");



ALTER TABLE ONLY "public"."researcher_contributions"
    ADD CONSTRAINT "researcher_contributions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."researcher_phase_debriefs"
    ADD CONSTRAINT "researcher_phase_debriefs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."researcher_phase_debriefs"
    ADD CONSTRAINT "researcher_phase_debriefs_user_id_phase_id_key" UNIQUE ("user_id", "phase_id");



ALTER TABLE ONLY "public"."researcher_portfolios"
    ADD CONSTRAINT "researcher_portfolios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_mentor_presence"
    ADD CONSTRAINT "site_mentor_presence_pkey" PRIMARY KEY ("site", "period_start");



ALTER TABLE ONLY "public"."system_events"
    ADD CONSTRAINT "system_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_team_code_key" UNIQUE ("team_code");



ALTER TABLE ONLY "public"."tech_skills_progress"
    ADD CONSTRAINT "tech_skills_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tech_skills_progress"
    ADD CONSTRAINT "tech_skills_progress_user_id_phase_id_task_name_key" UNIQUE ("user_id", "phase_id", "task_name");



ALTER TABLE ONLY "public"."triage_dedup"
    ADD CONSTRAINT "triage_dedup_pkey" PRIMARY KEY ("dedup_key");



ALTER TABLE ONLY "public"."user_monthly_assessments"
    ADD CONSTRAINT "user_monthly_assessments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_personality_baseline"
    ADD CONSTRAINT "user_personality_baseline_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."vibe_coding_sessions"
    ADD CONSTRAINT "vibe_coding_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."video_generations"
    ADD CONSTRAINT "video_generations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."video_studio_projects"
    ADD CONSTRAINT "video_studio_projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."voice_generations"
    ADD CONSTRAINT "voice_generations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_challenge_projects"
    ADD CONSTRAINT "weekly_challenge_projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_champions"
    ADD CONSTRAINT "weekly_champions_pkey" PRIMARY KEY ("id");



CREATE INDEX "ai_playground_chats_user_updated" ON "public"."ai_playground_chats" USING "btree" ("user_id", "updated_at" DESC);



CREATE INDEX "dashboard_ab730_session_id_idx" ON "public"."dashboard" USING "btree" ("ab730_session_id") WHERE ("ab730_session_id" IS NOT NULL);



CREATE INDEX "dashboard_ai900_session_id_idx" ON "public"."dashboard" USING "btree" ("ai900_session_id") WHERE ("ai900_session_id" IS NOT NULL);



CREATE INDEX "dashboard_biz_cert_session_id_idx" ON "public"."dashboard" USING "btree" ("biz_cert_session_id") WHERE ("biz_cert_session_id" IS NOT NULL);



CREATE INDEX "dashboard_business_session_id_idx" ON "public"."dashboard" USING "btree" ("business_session_id") WHERE ("business_session_id" IS NOT NULL);



CREATE INDEX "dashboard_content_session_id_idx" ON "public"."dashboard" USING "btree" ("content_session_id") WHERE ("content_session_id" IS NOT NULL);



CREATE INDEX "dashboard_fs_cert_session_id_idx" ON "public"."dashboard" USING "btree" ("fs_cert_session_id") WHERE ("fs_cert_session_id" IS NOT NULL);



CREATE INDEX "dashboard_fs_session_id_idx" ON "public"."dashboard" USING "btree" ("fs_session_id") WHERE ("fs_session_id" IS NOT NULL);



CREATE INDEX "dashboard_image_cert_session_id_idx" ON "public"."dashboard" USING "btree" ("image_cert_session_id") WHERE ("image_cert_session_id" IS NOT NULL);



CREATE INDEX "dashboard_voice_cert_session_id_idx" ON "public"."dashboard" USING "btree" ("voice_cert_session_id") WHERE ("voice_cert_session_id" IS NOT NULL);



CREATE INDEX "dashboard_wf_cert_session_id_idx" ON "public"."dashboard" USING "btree" ("wf_cert_session_id") WHERE ("wf_cert_session_id" IS NOT NULL);



CREATE INDEX "dashboard_workflow_session_id_idx" ON "public"."dashboard" USING "btree" ("workflow_session_id") WHERE ("workflow_session_id" IS NOT NULL);



CREATE INDEX "idx_agc_created_at" ON "public"."agriculture_consultations" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_agc_farmer_id" ON "public"."agriculture_consultations" USING "btree" ("farmer_id");



CREATE INDEX "idx_agc_follow_up" ON "public"."agriculture_consultations" USING "btree" ("follow_up_needed", "follow_up_date") WHERE (("follow_up_needed" = true) AND ("resolved" = false));



CREATE INDEX "idx_agc_youth_user_id" ON "public"."agriculture_consultations" USING "btree" ("youth_user_id");



CREATE INDEX "idx_agents_is_shared" ON "public"."agents" USING "btree" ("is_shared") WHERE ("is_shared" = true);



CREATE INDEX "idx_agents_user_id" ON "public"."agents" USING "btree" ("user_id");



CREATE INDEX "idx_agf_youth_user_id" ON "public"."agriculture_farmers" USING "btree" ("youth_user_id");



CREATE INDEX "idx_ahc_created_at" ON "public"."animal_husbandry_consultations" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_ahc_farmer_id" ON "public"."animal_husbandry_consultations" USING "btree" ("farmer_id");



CREATE INDEX "idx_ahc_follow_up" ON "public"."animal_husbandry_consultations" USING "btree" ("follow_up_needed", "follow_up_date") WHERE (("follow_up_needed" = true) AND ("resolved" = false));



CREATE INDEX "idx_ahc_urgency_level" ON "public"."animal_husbandry_consultations" USING "btree" ("urgency_level");



CREATE INDEX "idx_ahc_youth_user_id" ON "public"."animal_husbandry_consultations" USING "btree" ("youth_user_id");



CREATE INDEX "idx_ahf_youth_user_id" ON "public"."animal_husbandry_farmers" USING "btree" ("youth_user_id");



CREATE INDEX "idx_ai_playground_chats_updated_at" ON "public"."ai_playground_chats" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_ai_playground_chats_user_id" ON "public"."ai_playground_chats" USING "btree" ("user_id");



CREATE INDEX "idx_ai_sessions_user" ON "public"."research_ai_sessions" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_ai_sessions_user_task" ON "public"."research_ai_sessions" USING "btree" ("task_id", "user_id");



CREATE INDEX "idx_api_cost_log_daily" ON "public"."api_cost_log" USING "btree" ("logged_at", "provider");



CREATE INDEX "idx_api_cost_log_logged_at" ON "public"."api_cost_log" USING "btree" ("logged_at" DESC);



CREATE INDEX "idx_api_cost_log_page" ON "public"."api_cost_log" USING "btree" ("page");



CREATE INDEX "idx_api_cost_log_provider" ON "public"."api_cost_log" USING "btree" ("provider");



CREATE INDEX "idx_badges_user" ON "public"."research_badges" USING "btree" ("user_id");



CREATE INDEX "idx_challenges_org_active" ON "public"."community_challenges" USING "btree" ("org_id", "active", "week_start" DESC);



CREATE INDEX "idx_challenges_slug" ON "public"."community_challenges" USING "btree" ("community_impact_slug", "org_id", "active");



CREATE INDEX "idx_contributions_phase" ON "public"."researcher_contributions" USING "btree" ("phase_id");



CREATE INDEX "idx_contributions_team" ON "public"."researcher_contributions" USING "btree" ("team_id");



CREATE INDEX "idx_contributions_type" ON "public"."researcher_contributions" USING "btree" ("contribution_type");



CREATE INDEX "idx_contributions_user" ON "public"."researcher_contributions" USING "btree" ("user_id");



CREATE INDEX "idx_conversations_agent_id" ON "public"."agent_conversations" USING "btree" ("agent_id");



CREATE INDEX "idx_conversations_user_id" ON "public"."agent_conversations" USING "btree" ("user_id");



CREATE INDEX "idx_daily_activity_log_date" ON "public"."daily_activity_log" USING "btree" ("log_date" DESC);



CREATE INDEX "idx_daily_reflections_date" ON "public"."daily_reflections" USING "btree" ("reflection_date");



CREATE INDEX "idx_daily_reflections_user" ON "public"."daily_reflections" USING "btree" ("user_id");



CREATE INDEX "idx_daily_reflections_user_date" ON "public"."daily_reflections" USING "btree" ("user_id", "reflection_date" DESC);



CREATE INDEX "idx_dashboard_agriculture_cert" ON "public"."dashboard" USING "btree" ("user_id", "activity") WHERE ("activity" = 'Agriculture Consultant Certification'::"text");



CREATE INDEX "idx_dashboard_ambassador_cert" ON "public"."dashboard" USING "btree" ("user_id", "activity") WHERE ("activity" = 'AI Ambassadors Certification'::"text");



CREATE INDEX "idx_dashboard_category_sub_category" ON "public"."dashboard" USING "btree" ("category_activity", "sub_category");



CREATE INDEX "idx_dashboard_certificate_url" ON "public"."dashboard" USING "btree" ("user_id", "certificate_pdf_url") WHERE ("certificate_pdf_url" IS NOT NULL);



CREATE INDEX "idx_dashboard_english_skills" ON "public"."dashboard" USING "btree" ("user_id", "activity") WHERE ("activity" = 'english_skills'::"text");



CREATE INDEX "idx_dashboard_entrepreneurship_cert" ON "public"."dashboard" USING "btree" ("user_id", "activity") WHERE ("activity" = 'Entrepreneurship Consultant Certification'::"text");



CREATE INDEX "idx_dashboard_fishing_cert" ON "public"."dashboard" USING "btree" ("user_id", "activity") WHERE ("activity" = 'Fishing Consultant Certification'::"text");



CREATE INDEX "idx_dashboard_grade_level" ON "public"."dashboard" USING "btree" ("grade_level");



CREATE INDEX "idx_dashboard_healthcare_cert" ON "public"."dashboard" USING "btree" ("user_id", "activity") WHERE ("activity" = 'Healthcare Navigator Certification'::"text");



CREATE INDEX "idx_dashboard_learning_module" ON "public"."dashboard" USING "btree" ("learning_module_id");



CREATE INDEX "idx_dashboard_progress" ON "public"."dashboard" USING "btree" ("progress");



CREATE INDEX "idx_dashboard_stats_learner_month" ON "public"."dashboard_stats" USING "btree" ("learner_token", "cohort_month");



CREATE INDEX "idx_dashboard_storage_path" ON "public"."dashboard" USING "btree" ("web_dev_storage_path") WHERE ("web_dev_storage_path" IS NOT NULL);



CREATE INDEX "idx_dashboard_sub_category" ON "public"."dashboard" USING "btree" ("sub_category");



CREATE INDEX "idx_dashboard_user_id" ON "public"."dashboard" USING "btree" ("user_id");



CREATE INDEX "idx_dashboard_user_math" ON "public"."dashboard" USING "btree" ("user_id", "activity") WHERE ("activity" = 'math_skills'::"text");



CREATE INDEX "idx_dashboard_user_progress" ON "public"."dashboard" USING "btree" ("user_id", "progress");



CREATE INDEX "idx_debriefs_phase" ON "public"."researcher_phase_debriefs" USING "btree" ("phase_id");



CREATE INDEX "idx_debriefs_status" ON "public"."researcher_phase_debriefs" USING "btree" ("status");



CREATE INDEX "idx_debriefs_user" ON "public"."researcher_phase_debriefs" USING "btree" ("user_id");



CREATE INDEX "idx_ds_active" ON "public"."dashboard_stats" USING "btree" ("activity_date", "site") WHERE ("k_anon_suppressed" = false);



CREATE INDEX "idx_ds_activity_date" ON "public"."dashboard_stats" USING "btree" ("activity_date");



CREATE INDEX "idx_ds_cohort_month" ON "public"."dashboard_stats" USING "btree" ("cohort_month");



CREATE INDEX "idx_ds_learner_token" ON "public"."dashboard_stats" USING "btree" ("learner_token");



CREATE INDEX "idx_ds_site" ON "public"."dashboard_stats" USING "btree" ("site");



CREATE INDEX "idx_ds_site_date" ON "public"."dashboard_stats" USING "btree" ("site", "activity_date");



CREATE INDEX "idx_ec_youth_user_id" ON "public"."entrepreneurship_clients" USING "btree" ("youth_user_id");



CREATE INDEX "idx_econ_client_id" ON "public"."entrepreneurship_consultations" USING "btree" ("client_id");



CREATE INDEX "idx_econ_created_at" ON "public"."entrepreneurship_consultations" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_econ_follow_up" ON "public"."entrepreneurship_consultations" USING "btree" ("follow_up_needed", "follow_up_date") WHERE (("follow_up_needed" = true) AND ("resolved" = false));



CREATE INDEX "idx_econ_youth_user_id" ON "public"."entrepreneurship_consultations" USING "btree" ("youth_user_id");



CREATE INDEX "idx_enrollments_challenge" ON "public"."challenge_enrollments" USING "btree" ("challenge_id");



CREATE INDEX "idx_enrollments_learner_status" ON "public"."challenge_enrollments" USING "btree" ("learner_id", "status");



CREATE INDEX "idx_enrollments_referral" ON "public"."challenge_enrollments" USING "btree" ("referral_enrollee_id") WHERE ("referral_enrollee_id" IS NOT NULL);



CREATE INDEX "idx_fc_youth_user_id" ON "public"."fishing_clients" USING "btree" ("youth_user_id");



CREATE INDEX "idx_fcon_client_id" ON "public"."fishing_consultations" USING "btree" ("client_id");



CREATE INDEX "idx_fcon_created_at" ON "public"."fishing_consultations" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_fcon_follow_up" ON "public"."fishing_consultations" USING "btree" ("follow_up_needed", "follow_up_date") WHERE (("follow_up_needed" = true) AND ("resolved" = false));



CREATE INDEX "idx_fcon_youth_user_id" ON "public"."fishing_consultations" USING "btree" ("youth_user_id");



CREATE INDEX "idx_findings_site" ON "public"."research_findings" USING "btree" ("site");



CREATE INDEX "idx_findings_task" ON "public"."research_findings" USING "btree" ("task_id");



CREATE INDEX "idx_findings_user" ON "public"."research_findings" USING "btree" ("user_id");



CREATE INDEX "idx_grand_learner" ON "public"."grand_challenge_submissions" USING "btree" ("learner_id", "quarter");



CREATE INDEX "idx_grand_org_quarter" ON "public"."grand_challenge_submissions" USING "btree" ("org_id", "quarter", "status");



CREATE INDEX "idx_grand_winners" ON "public"."grand_challenge_submissions" USING "btree" ("org_id", "quarter") WHERE ("is_quarter_winner" = true);



CREATE INDEX "idx_ha_created_at" ON "public"."health_assessments" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_ha_follow_up" ON "public"."health_assessments" USING "btree" ("follow_up_needed", "follow_up_date") WHERE (("follow_up_needed" = true) AND ("resolved" = false));



CREATE INDEX "idx_ha_patient_id" ON "public"."health_assessments" USING "btree" ("patient_id");



CREATE INDEX "idx_ha_red_open" ON "public"."health_assessments" USING "btree" ("youth_user_id", "created_at" DESC) WHERE (("triage_level" = 'red'::"text") AND ("resolved" = false));



CREATE INDEX "idx_ha_triage_level" ON "public"."health_assessments" USING "btree" ("triage_level");



CREATE INDEX "idx_ha_youth_user_id" ON "public"."health_assessments" USING "btree" ("youth_user_id");



CREATE INDEX "idx_hp_patient_group" ON "public"."health_patients" USING "btree" ("patient_group");



CREATE INDEX "idx_hp_youth_user_id" ON "public"."health_patients" USING "btree" ("youth_user_id");



CREATE INDEX "idx_journal_enrollment" ON "public"."community_impact_journal" USING "btree" ("enrollment_id") WHERE ("enrollment_id" IS NOT NULL);



CREATE INDEX "idx_journal_learner" ON "public"."community_impact_journal" USING "btree" ("learner_id", "created_at" DESC);



CREATE INDEX "idx_journal_org" ON "public"."community_impact_journal" USING "btree" ("org_id", "visit_date" DESC);



CREATE INDEX "idx_learning_modules_public" ON "public"."learning_modules" USING "btree" ("public");



CREATE INDEX "idx_learning_modules_user_id" ON "public"."learning_modules" USING "btree" ("user_id");



CREATE INDEX "idx_messages_conversation" ON "public"."agent_messages" USING "btree" ("conversation_id");



CREATE INDEX "idx_monthly_measured" ON "public"."user_monthly_assessments" USING "btree" ("measured_at");



CREATE INDEX "idx_monthly_user" ON "public"."user_monthly_assessments" USING "btree" ("user_id");



CREATE INDEX "idx_monthly_user_date" ON "public"."user_monthly_assessments" USING "btree" ("user_id", "measured_at" DESC);



CREATE UNIQUE INDEX "idx_organizations_join_code" ON "public"."organizations" USING "btree" ("join_code");



CREATE INDEX "idx_organizations_leader_id" ON "public"."organizations" USING "btree" ("leader_id");



CREATE INDEX "idx_personality_measured" ON "public"."user_personality_baseline" USING "btree" ("measured_at");



CREATE INDEX "idx_personality_user" ON "public"."user_personality_baseline" USING "btree" ("user_id");



CREATE INDEX "idx_portfolios_phase" ON "public"."researcher_portfolios" USING "btree" ("phase_id");



CREATE INDEX "idx_portfolios_project" ON "public"."researcher_portfolios" USING "btree" ("project_id");



CREATE INDEX "idx_portfolios_user" ON "public"."researcher_portfolios" USING "btree" ("user_id");



CREATE INDEX "idx_profiles_agent_access" ON "public"."profiles" USING "btree" ("agent_builder_access") WHERE ("agent_builder_access" = true);



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_profiles_organization_id" ON "public"."profiles" USING "btree" ("organization_id");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_profiles_team_id" ON "public"."profiles" USING "btree" ("team_id");



CREATE INDEX "idx_research_studies_question_id" ON "public"."research_studies" USING "btree" ("question_id");



CREATE INDEX "idx_rgq_program_id" ON "public"."research_guiding_questions" USING "btree" ("program_id");



CREATE INDEX "idx_site_mentor_presence_site_period" ON "public"."site_mentor_presence" USING "btree" ("site", "period_start", "period_end");



CREATE INDEX "idx_snapshots_site_date" ON "public"."research_platform_snapshots" USING "btree" ("site", "snapshot_date" DESC);



CREATE INDEX "idx_system_events_cohort" ON "public"."system_events" USING "btree" ("cohort", "created_at" DESC);



CREATE INDEX "idx_system_events_event_type" ON "public"."system_events" USING "btree" ("event_type", "created_at" DESC);



CREATE INDEX "idx_system_events_function" ON "public"."system_events" USING "btree" ("function_name", "created_at" DESC);



CREATE INDEX "idx_system_events_provider" ON "public"."system_events" USING "btree" ("provider");



CREATE INDEX "idx_system_events_provider_severity" ON "public"."system_events" USING "btree" ("provider", "severity", "created_at" DESC);



CREATE INDEX "idx_system_events_severity" ON "public"."system_events" USING "btree" ("severity", "created_at" DESC);



CREATE INDEX "idx_tasks_phase" ON "public"."research_tasks" USING "btree" ("phase_id");



CREATE INDEX "idx_team_members_team" ON "public"."research_team_members" USING "btree" ("team_id");



CREATE INDEX "idx_team_members_user" ON "public"."research_team_members" USING "btree" ("user_id");



CREATE INDEX "idx_tiers_learner_org" ON "public"."community_impact_tiers" USING "btree" ("learner_id", "org_id");



CREATE INDEX "idx_tiers_org_awarded" ON "public"."community_impact_tiers" USING "btree" ("org_id", "awarded_at" DESC);



CREATE INDEX "idx_uma_ci_active" ON "public"."user_monthly_assessments" USING "btree" ("user_id") WHERE ("ci_training_sessions_total" > 0);



CREATE INDEX "idx_uma_pue_energy" ON "public"."user_monthly_assessments" USING "btree" ("pue_energy_constraint_pct");



CREATE INDEX "idx_uma_role_teaching" ON "public"."user_monthly_assessments" USING "btree" ("role_teaching_intent_count");



CREATE INDEX "idx_uma_scaffold_trend" ON "public"."user_monthly_assessments" USING "btree" ("scaffold_convergence_trend");



CREATE INDEX "idx_vsp_user_id" ON "public"."video_studio_projects" USING "btree" ("user_id");



CREATE INDEX "image_generations_user_id_idx" ON "public"."image_generations" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "organizations_join_codes_gin" ON "public"."organizations" USING "gin" ("join_codes");



CREATE INDEX "organizations_leader_id_idx" ON "public"."organizations" USING "btree" ("leader_id");



CREATE INDEX "platform_news_active_created" ON "public"."platform_news" USING "btree" ("active", "created_at" DESC);



CREATE INDEX "platform_news_org_ids_gin" ON "public"."platform_news" USING "gin" ("organization_ids");



CREATE INDEX "playground_context_expires_at_idx" ON "public"."playground_context" USING "btree" ("expires_at");



CREATE INDEX "playground_context_user_id_chat_id_idx" ON "public"."playground_context" USING "btree" ("user_id", "chat_id");



CREATE INDEX "projects_team_id_idx" ON "public"."projects" USING "btree" ("team_id");



CREATE INDEX "projects_user_id_idx" ON "public"."projects" USING "btree" ("user_id");



CREATE INDEX "triage_dedup_created_at_idx" ON "public"."triage_dedup" USING "btree" ("created_at");



CREATE INDEX "video_generations_user_id_idx" ON "public"."video_generations" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "voice_generations_user_id_idx" ON "public"."voice_generations" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "weekly_champions_org_week_idx" ON "public"."weekly_champions" USING "btree" ("org_id", "week_start");



CREATE OR REPLACE VIEW "public"."agriculture_farmer_summary" AS
 SELECT "f"."id",
    "f"."youth_user_id",
    "f"."farmer_name",
    "f"."village",
    "f"."phone",
    "f"."crops",
    "f"."notes",
    "f"."created_at",
    "f"."updated_at",
    "count"("c"."id") AS "total_consultations",
    "count"("c"."id") FILTER (WHERE ("c"."resolved" = false)) AS "open_cases",
    "max"("c"."created_at") AS "last_consultation_at"
   FROM ("public"."agriculture_farmers" "f"
     LEFT JOIN "public"."agriculture_consultations" "c" ON (("c"."farmer_id" = "f"."id")))
  GROUP BY "f"."id";



CREATE OR REPLACE VIEW "public"."animal_husbandry_farmer_summary" AS
 SELECT "f"."id",
    "f"."youth_user_id",
    "f"."farmer_name",
    "f"."village",
    "f"."phone",
    "f"."animals",
    "f"."notes",
    "f"."created_at",
    "f"."updated_at",
    "count"("c"."id") AS "total_consultations",
    "count"("c"."id") FILTER (WHERE ("c"."resolved" = false)) AS "open_cases",
    "count"("c"."id") FILTER (WHERE (("c"."urgency_level" = 'emergency'::"text") AND ("c"."resolved" = false))) AS "emergency_count",
    "max"("c"."created_at") AS "last_consultation_at"
   FROM ("public"."animal_husbandry_farmers" "f"
     LEFT JOIN "public"."animal_husbandry_consultations" "c" ON (("c"."farmer_id" = "f"."id")))
  GROUP BY "f"."id";



CREATE OR REPLACE VIEW "public"."fishing_client_summary" AS
 SELECT "f"."id",
    "f"."youth_user_id",
    "f"."client_name",
    "f"."village",
    "f"."phone",
    "f"."activities",
    "f"."waterways",
    "f"."notes",
    "f"."created_at",
    "f"."updated_at",
    "count"("c"."id") AS "total_consultations",
    "count"("c"."id") FILTER (WHERE ("c"."resolved" = false)) AS "open_cases",
    "max"("c"."created_at") AS "last_consultation_at"
   FROM ("public"."fishing_clients" "f"
     LEFT JOIN "public"."fishing_consultations" "c" ON (("c"."client_id" = "f"."id")))
  GROUP BY "f"."id";



CREATE OR REPLACE VIEW "public"."entrepreneurship_client_summary" AS
 SELECT "c"."id",
    "c"."youth_user_id",
    "c"."client_name",
    "c"."village",
    "c"."phone",
    "c"."business_type",
    "c"."business_stage",
    "c"."notes",
    "c"."created_at",
    "c"."updated_at",
    "count"("con"."id") AS "total_consultations",
    "count"("con"."id") FILTER (WHERE ("con"."resolved" = false)) AS "open_cases",
    "max"("con"."created_at") AS "last_consultation_at"
   FROM ("public"."entrepreneurship_clients" "c"
     LEFT JOIN "public"."entrepreneurship_consultations" "con" ON (("con"."client_id" = "c"."id")))
  GROUP BY "c"."id";



CREATE OR REPLACE TRIGGER "agents_updated_at" BEFORE UPDATE ON "public"."agents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "certification_assessments_set_updated_at" BEFORE UPDATE ON "public"."certification_assessments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "conversations_updated_at" BEFORE UPDATE ON "public"."agent_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "org_set_leader_id" BEFORE INSERT ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."set_org_leader_id"();



CREATE OR REPLACE TRIGGER "trg_agc_updated_at" BEFORE UPDATE ON "public"."agriculture_consultations" FOR EACH ROW EXECUTE FUNCTION "public"."update_agc_updated_at"();



CREATE OR REPLACE TRIGGER "trg_agf_updated_at" BEFORE UPDATE ON "public"."agriculture_farmers" FOR EACH ROW EXECUTE FUNCTION "public"."update_agf_updated_at"();



CREATE OR REPLACE TRIGGER "trg_ahc_updated_at" BEFORE UPDATE ON "public"."animal_husbandry_consultations" FOR EACH ROW EXECUTE FUNCTION "public"."update_ahc_updated_at"();



CREATE OR REPLACE TRIGGER "trg_ahf_updated_at" BEFORE UPDATE ON "public"."animal_husbandry_farmers" FOR EACH ROW EXECUTE FUNCTION "public"."update_ahf_updated_at"();



CREATE OR REPLACE TRIGGER "trg_bridge_tier" AFTER INSERT OR UPDATE OF "referral_enrollee_id" ON "public"."challenge_enrollments" FOR EACH ROW EXECUTE FUNCTION "public"."award_bridge_tier_on_referral"();



CREATE OR REPLACE TRIGGER "trg_daily_reflections_updated_at" BEFORE UPDATE ON "public"."daily_reflections" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_ec_updated_at" BEFORE UPDATE ON "public"."entrepreneurship_clients" FOR EACH ROW EXECUTE FUNCTION "public"."update_ec_updated_at"();



CREATE OR REPLACE TRIGGER "trg_econ_updated_at" BEFORE UPDATE ON "public"."entrepreneurship_consultations" FOR EACH ROW EXECUTE FUNCTION "public"."update_econ_updated_at"();



CREATE OR REPLACE TRIGGER "trg_fc_updated_at" BEFORE UPDATE ON "public"."fishing_clients" FOR EACH ROW EXECUTE FUNCTION "public"."update_fc_updated_at"();



CREATE OR REPLACE TRIGGER "trg_fcon_updated_at" BEFORE UPDATE ON "public"."fishing_consultations" FOR EACH ROW EXECUTE FUNCTION "public"."update_fcon_updated_at"();



CREATE OR REPLACE TRIGGER "trg_grand_updated_at" BEFORE UPDATE ON "public"."grand_challenge_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_grand"();



CREATE OR REPLACE TRIGGER "trg_ha_updated_at" BEFORE UPDATE ON "public"."health_assessments" FOR EACH ROW EXECUTE FUNCTION "public"."update_ha_updated_at"();



CREATE OR REPLACE TRIGGER "trg_hp_updated_at" BEFORE UPDATE ON "public"."health_patients" FOR EACH ROW EXECUTE FUNCTION "public"."update_hp_updated_at"();



CREATE OR REPLACE TRIGGER "trg_journal_updated_at" BEFORE UPDATE ON "public"."community_impact_journal" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_grand"();



CREATE OR REPLACE TRIGGER "trg_multiplier_on_mentee" AFTER UPDATE OF "status" ON "public"."challenge_enrollments" FOR EACH ROW EXECUTE FUNCTION "public"."award_multiplier_on_mentee_completion"();



CREATE OR REPLACE TRIGGER "trg_portfolios_updated" BEFORE UPDATE ON "public"."researcher_portfolios" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_progress_updated" BEFORE UPDATE ON "public"."research_task_progress" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_projects_updated" BEFORE UPDATE ON "public"."research_studies" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_refresh_contribution_summary" AFTER INSERT ON "public"."researcher_contributions" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_contribution_summary"();



CREATE OR REPLACE TRIGGER "trg_research_guiding_questions_updated_at" BEFORE UPDATE ON "public"."research_guiding_questions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_research_programs_updated_at" BEFORE UPDATE ON "public"."research_programs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_research_studies_updated_at" BEFORE UPDATE ON "public"."research_studies" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_team_name" BEFORE INSERT ON "public"."research_teams" FOR EACH ROW EXECUTE FUNCTION "public"."set_team_name"();



CREATE OR REPLACE TRIGGER "trg_tasks_updated" BEFORE UPDATE ON "public"."research_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_delete_leaderboard" INSTEAD OF DELETE ON "public"."community_leaderboard" FOR EACH ROW EXECUTE FUNCTION "public"."delete_from_leaderboard_view"();



CREATE OR REPLACE TRIGGER "trigger_set_team_code" BEFORE INSERT ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."set_team_code"();



CREATE OR REPLACE TRIGGER "update_dashboard_updated_at" BEFORE UPDATE ON "public"."dashboard" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_projects_updated_at" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."agent_conversations"
    ADD CONSTRAINT "agent_conversations_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_conversations"
    ADD CONSTRAINT "agent_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_messages"
    ADD CONSTRAINT "agent_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agriculture_consultations"
    ADD CONSTRAINT "agriculture_consultations_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "public"."agriculture_farmers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agriculture_consultations"
    ADD CONSTRAINT "agriculture_consultations_youth_user_id_fkey" FOREIGN KEY ("youth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agriculture_farmers"
    ADD CONSTRAINT "agriculture_farmers_youth_user_id_fkey" FOREIGN KEY ("youth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_playground_chats"
    ADD CONSTRAINT "ai_playground_chats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."animal_husbandry_consultations"
    ADD CONSTRAINT "animal_husbandry_consultations_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "public"."animal_husbandry_farmers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."animal_husbandry_consultations"
    ADD CONSTRAINT "animal_husbandry_consultations_youth_user_id_fkey" FOREIGN KEY ("youth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."animal_husbandry_farmers"
    ADD CONSTRAINT "animal_husbandry_farmers_youth_user_id_fkey" FOREIGN KEY ("youth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assessments_monthly_global"
    ADD CONSTRAINT "assessments_monthly_global_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."challenge_enrollments"
    ADD CONSTRAINT "challenge_enrollments_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."community_challenges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenge_enrollments"
    ADD CONSTRAINT "challenge_enrollments_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenge_enrollments"
    ADD CONSTRAINT "challenge_enrollments_referral_enrollee_id_fkey" FOREIGN KEY ("referral_enrollee_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."community_challenges"
    ADD CONSTRAINT "community_challenges_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."community_impact_journal"
    ADD CONSTRAINT "community_impact_journal_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."community_challenges"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."community_impact_journal"
    ADD CONSTRAINT "community_impact_journal_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "public"."challenge_enrollments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."community_impact_journal"
    ADD CONSTRAINT "community_impact_journal_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_impact_tiers"
    ADD CONSTRAINT "community_impact_tiers_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "public"."community_challenges"("id");



ALTER TABLE ONLY "public"."community_impact_tiers"
    ADD CONSTRAINT "community_impact_tiers_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "public"."challenge_enrollments"("id");



ALTER TABLE ONLY "public"."community_impact_tiers"
    ADD CONSTRAINT "community_impact_tiers_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."community_impact_tiers"
    ADD CONSTRAINT "community_impact_tiers_referred_learner_id_fkey" FOREIGN KEY ("referred_learner_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."consultation_evidence_links"
    ADD CONSTRAINT "consultation_evidence_links_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."daily_reflections"
    ADD CONSTRAINT "daily_reflections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dashboard"
    ADD CONSTRAINT "dashboard_learning_module_id_fkey" FOREIGN KEY ("learning_module_id") REFERENCES "public"."learning_modules"("learning_module_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dashboard"
    ADD CONSTRAINT "dashboard_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dashboard"
    ADD CONSTRAINT "dashboard_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."debrief_questions"
    ADD CONSTRAINT "debrief_questions_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "public"."research_phases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."enterprise_ledger_entries"
    ADD CONSTRAINT "enterprise_ledger_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."entrepreneurship_clients"
    ADD CONSTRAINT "entrepreneurship_clients_youth_user_id_fkey" FOREIGN KEY ("youth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entrepreneurship_consultations"
    ADD CONSTRAINT "entrepreneurship_consultations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."entrepreneurship_clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entrepreneurship_consultations"
    ADD CONSTRAINT "entrepreneurship_consultations_youth_user_id_fkey" FOREIGN KEY ("youth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fishing_clients"
    ADD CONSTRAINT "fishing_clients_youth_user_id_fkey" FOREIGN KEY ("youth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fishing_consultations"
    ADD CONSTRAINT "fishing_consultations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."fishing_clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fishing_consultations"
    ADD CONSTRAINT "fishing_consultations_youth_user_id_fkey" FOREIGN KEY ("youth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_modules"
    ADD CONSTRAINT "fk_learning_modules_user_id" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "fk_team_members_user" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."grand_challenge_submissions"
    ADD CONSTRAINT "grand_challenge_submissions_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."health_assessments"
    ADD CONSTRAINT "health_assessments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."health_patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."health_assessments"
    ADD CONSTRAINT "health_assessments_youth_user_id_fkey" FOREIGN KEY ("youth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."health_patients"
    ADD CONSTRAINT "health_patients_youth_user_id_fkey" FOREIGN KEY ("youth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."image_generations"
    ADD CONSTRAINT "image_generations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."phase_eligibility_thresholds"
    ADD CONSTRAINT "phase_eligibility_thresholds_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "public"."research_phases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."playground_context"
    ADD CONSTRAINT "playground_context_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_merged_into_fkey" FOREIGN KEY ("merged_into") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_ai_sessions"
    ADD CONSTRAINT "research_ai_sessions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."research_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_ai_sessions"
    ADD CONSTRAINT "research_ai_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_badges"
    ADD CONSTRAINT "research_badges_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "public"."research_phases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_badges"
    ADD CONSTRAINT "research_badges_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."research_studies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_badges"
    ADD CONSTRAINT "research_badges_study_id_fkey" FOREIGN KEY ("study_id") REFERENCES "public"."research_studies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_badges"
    ADD CONSTRAINT "research_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_badges"
    ADD CONSTRAINT "research_badges_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."research_findings"
    ADD CONSTRAINT "research_findings_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."research_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_findings"
    ADD CONSTRAINT "research_findings_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."research_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_findings"
    ADD CONSTRAINT "research_findings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_guiding_questions"
    ADD CONSTRAINT "research_guiding_questions_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."research_programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_phases"
    ADD CONSTRAINT "research_phases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."research_studies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_phases"
    ADD CONSTRAINT "research_phases_study_id_fkey" FOREIGN KEY ("study_id") REFERENCES "public"."research_studies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_programs"
    ADD CONSTRAINT "research_programs_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."research_studies"
    ADD CONSTRAINT "research_projects_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."research_guiding_questions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."research_task_progress"
    ADD CONSTRAINT "research_task_progress_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."research_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_task_progress"
    ADD CONSTRAINT "research_task_progress_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."research_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_task_progress"
    ADD CONSTRAINT "research_task_progress_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."research_tasks"
    ADD CONSTRAINT "research_tasks_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "public"."research_phases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_team_members"
    ADD CONSTRAINT "research_team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."research_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_team_members"
    ADD CONSTRAINT "research_team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_teams"
    ADD CONSTRAINT "research_teams_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."research_teams"
    ADD CONSTRAINT "research_teams_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."research_studies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."research_teams"
    ADD CONSTRAINT "research_teams_study_id_fkey" FOREIGN KEY ("study_id") REFERENCES "public"."research_studies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."researcher_contribution_summary"
    ADD CONSTRAINT "researcher_contribution_summary_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "public"."research_phases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."researcher_contribution_summary"
    ADD CONSTRAINT "researcher_contribution_summary_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."research_studies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."researcher_contribution_summary"
    ADD CONSTRAINT "researcher_contribution_summary_study_id_fkey" FOREIGN KEY ("study_id") REFERENCES "public"."research_studies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."researcher_contribution_summary"
    ADD CONSTRAINT "researcher_contribution_summary_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."researcher_contributions"
    ADD CONSTRAINT "researcher_contributions_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "public"."research_phases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."researcher_contributions"
    ADD CONSTRAINT "researcher_contributions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."research_studies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."researcher_contributions"
    ADD CONSTRAINT "researcher_contributions_study_id_fkey" FOREIGN KEY ("study_id") REFERENCES "public"."research_studies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."researcher_contributions"
    ADD CONSTRAINT "researcher_contributions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."research_tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."researcher_contributions"
    ADD CONSTRAINT "researcher_contributions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."research_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."researcher_contributions"
    ADD CONSTRAINT "researcher_contributions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."researcher_phase_debriefs"
    ADD CONSTRAINT "researcher_phase_debriefs_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "public"."research_phases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."researcher_phase_debriefs"
    ADD CONSTRAINT "researcher_phase_debriefs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."research_studies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."researcher_phase_debriefs"
    ADD CONSTRAINT "researcher_phase_debriefs_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."researcher_phase_debriefs"
    ADD CONSTRAINT "researcher_phase_debriefs_study_id_fkey" FOREIGN KEY ("study_id") REFERENCES "public"."research_studies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."researcher_phase_debriefs"
    ADD CONSTRAINT "researcher_phase_debriefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."researcher_portfolios"
    ADD CONSTRAINT "researcher_portfolios_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "public"."research_findings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."researcher_portfolios"
    ADD CONSTRAINT "researcher_portfolios_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "public"."research_phases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."researcher_portfolios"
    ADD CONSTRAINT "researcher_portfolios_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."research_studies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."researcher_portfolios"
    ADD CONSTRAINT "researcher_portfolios_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."researcher_portfolios"
    ADD CONSTRAINT "researcher_portfolios_study_id_fkey" FOREIGN KEY ("study_id") REFERENCES "public"."research_studies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."researcher_portfolios"
    ADD CONSTRAINT "researcher_portfolios_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."tech_skills_progress"
    ADD CONSTRAINT "tech_skills_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_monthly_assessments"
    ADD CONSTRAINT "user_monthly_assessments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_personality_baseline"
    ADD CONSTRAINT "user_personality_baseline_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vibe_coding_sessions"
    ADD CONSTRAINT "vibe_coding_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_generations"
    ADD CONSTRAINT "video_generations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_studio_projects"
    ADD CONSTRAINT "video_studio_projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."voice_generations"
    ADD CONSTRAINT "voice_generations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_challenge_projects"
    ADD CONSTRAINT "weekly_challenge_projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_champions"
    ADD CONSTRAINT "weekly_champions_champion_user_id_fkey" FOREIGN KEY ("champion_user_id") REFERENCES "auth"."users"("id");



CREATE POLICY "Admins can view all agriculture consultations" ON "public"."agriculture_consultations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['leader'::"public"."user_role", 'platform_administrator'::"public"."user_role"]))))));



CREATE POLICY "Admins can view all animal husbandry consultations" ON "public"."animal_husbandry_consultations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['leader'::"public"."user_role", 'platform_administrator'::"public"."user_role"]))))));



CREATE POLICY "Admins can view all enterprise ledger entries" ON "public"."enterprise_ledger_entries" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['leader'::"public"."user_role", 'platform_administrator'::"public"."user_role"]))))));



CREATE POLICY "Admins can view all entrepreneurship consultations" ON "public"."entrepreneurship_consultations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['leader'::"public"."user_role", 'platform_administrator'::"public"."user_role"]))))));



CREATE POLICY "Admins can view all evidence links" ON "public"."consultation_evidence_links" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['leader'::"public"."user_role", 'platform_administrator'::"public"."user_role"]))))));



CREATE POLICY "Admins can view all fishing consultations" ON "public"."fishing_consultations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['leader'::"public"."user_role", 'platform_administrator'::"public"."user_role"]))))));



CREATE POLICY "Admins can view all health assessments" ON "public"."health_assessments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['leader'::"public"."user_role", 'platform_administrator'::"public"."user_role"]))))));



CREATE POLICY "All users can view learning modules" ON "public"."learning_modules" FOR SELECT USING (true);



CREATE POLICY "Anyone can insert events" ON "public"."system_events" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Create team" ON "public"."research_teams" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "Facilitators can view all reflections" ON "public"."daily_reflections" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role")::"text" = ANY (ARRAY['facilitator'::"text", 'admin'::"text", 'leader'::"text"]))))));



CREATE POLICY "Learner manages own enterprise ledger" ON "public"."enterprise_ledger_entries" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Learner manages own evidence links" ON "public"."consultation_evidence_links" USING (("learner_id" = "auth"."uid"())) WITH CHECK (("learner_id" = "auth"."uid"()));



CREATE POLICY "Navigator: delete own assessments" ON "public"."health_assessments" FOR DELETE USING (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Navigator: delete own patients" ON "public"."health_patients" FOR DELETE USING (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Navigator: insert own assessments" ON "public"."health_assessments" FOR INSERT WITH CHECK (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Navigator: insert own patients" ON "public"."health_patients" FOR INSERT WITH CHECK (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Navigator: select own assessments" ON "public"."health_assessments" FOR SELECT USING (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Navigator: select own patients" ON "public"."health_patients" FOR SELECT USING (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Navigator: update own assessments" ON "public"."health_assessments" FOR UPDATE USING (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Navigator: update own patients" ON "public"."health_patients" FOR UPDATE USING (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Own AI sessions" ON "public"."research_ai_sessions" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Own debrief" ON "public"."researcher_phase_debriefs" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Public read: phases" ON "public"."research_phases" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Public read: projects" ON "public"."research_studies" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Public read: questions" ON "public"."debrief_questions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Public read: tasks" ON "public"."research_tasks" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Public read: thresholds" ON "public"."phase_eligibility_thresholds" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Read own badges" ON "public"."research_badges" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Read own contributions" ON "public"."researcher_contributions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Read own or co-authored portfolio" ON "public"."researcher_portfolios" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = ANY ("co_authors"))));



CREATE POLICY "Read own summary" ON "public"."researcher_contribution_summary" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Read own teams" ON "public"."research_teams" FOR SELECT TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR ("id" IN ( SELECT "research_team_members"."team_id"
   FROM "public"."research_team_members"
  WHERE ("research_team_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "Read snapshots" ON "public"."research_platform_snapshots" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Read task progress" ON "public"."research_task_progress" FOR SELECT TO "authenticated" USING (("team_id" IN ( SELECT "research_team_members"."team_id"
   FROM "public"."research_team_members"
  WHERE ("research_team_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Read team findings" ON "public"."research_findings" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("team_id" IN ( SELECT "research_team_members"."team_id"
   FROM "public"."research_team_members"
  WHERE ("research_team_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "Read team members" ON "public"."research_team_members" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("team_id" IN ( SELECT "research_team_members_1"."team_id"
   FROM "public"."research_team_members" "research_team_members_1"
  WHERE ("research_team_members_1"."user_id" = "auth"."uid"())))));



CREATE POLICY "Self signup" ON "public"."research_team_members" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Service role can update image jobs" ON "public"."image_generations" FOR UPDATE USING (true);



CREATE POLICY "Service role can update video jobs" ON "public"."video_generations" FOR UPDATE USING (true);



CREATE POLICY "Service role can update voice jobs" ON "public"."voice_generations" FOR UPDATE USING (true);



CREATE POLICY "Service role full access" ON "public"."system_events" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Team members can view team projects" ON "public"."projects" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."team_id" = "projects"."team_id")))));



CREATE POLICY "Update own portfolio" ON "public"."researcher_portfolios" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own chats" ON "public"."ai_playground_chats" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own learning modules" ON "public"."learning_modules" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own chats" ON "public"."ai_playground_chats" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own events" ON "public"."system_events" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ("auth"."uid"())::"text"));



CREATE POLICY "Users can insert their own image jobs" ON "public"."image_generations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own learning modules" ON "public"."learning_modules" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own reflections" ON "public"."daily_reflections" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own video jobs" ON "public"."video_generations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own voice jobs" ON "public"."voice_generations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own chats" ON "public"."ai_playground_chats" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own projects" ON "public"."projects" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can manage their own projects" ON "public"."weekly_challenge_projects" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own chats" ON "public"."ai_playground_chats" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own events" ON "public"."system_events" FOR SELECT TO "authenticated" USING ((("auth"."uid"())::"text" = "user_id"));



CREATE POLICY "Users can read their own image jobs" ON "public"."image_generations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read their own video jobs" ON "public"."video_generations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read their own voice jobs" ON "public"."voice_generations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own chats" ON "public"."ai_playground_chats" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own learning modules" ON "public"."learning_modules" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own reflections" ON "public"."daily_reflections" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own reflections" ON "public"."daily_reflections" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own sessions" ON "public"."vibe_coding_sessions" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Write own contributions" ON "public"."researcher_contributions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Write own findings" ON "public"."research_findings" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Write own portfolio" ON "public"."researcher_portfolios" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Youth advisor: delete own ag consultations" ON "public"."agriculture_consultations" FOR DELETE USING (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Youth advisor: delete own ag farmers" ON "public"."agriculture_farmers" FOR DELETE USING (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Youth advisor: delete own consultations" ON "public"."animal_husbandry_consultations" FOR DELETE USING (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Youth advisor: delete own farmers" ON "public"."animal_husbandry_farmers" FOR DELETE USING (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Youth advisor: delete own fishing clients" ON "public"."fishing_clients" FOR DELETE USING (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Youth advisor: delete own fishing consultations" ON "public"."fishing_consultations" FOR DELETE USING (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Youth advisor: insert own ag consultations" ON "public"."agriculture_consultations" FOR INSERT WITH CHECK (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Youth advisor: insert own ag farmers" ON "public"."agriculture_farmers" FOR INSERT WITH CHECK (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Youth advisor: insert own consultations" ON "public"."animal_husbandry_consultations" FOR INSERT WITH CHECK (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Youth advisor: insert own farmers" ON "public"."animal_husbandry_farmers" FOR INSERT WITH CHECK (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Youth advisor: insert own fishing clients" ON "public"."fishing_clients" FOR INSERT WITH CHECK (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Youth advisor: insert own fishing consultations" ON "public"."fishing_consultations" FOR INSERT WITH CHECK (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Youth advisor: select own ag consultations" ON "public"."agriculture_consultations" FOR SELECT USING (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Youth advisor: select own ag farmers" ON "public"."agriculture_farmers" FOR SELECT USING (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Youth advisor: select own consultations" ON "public"."animal_husbandry_consultations" FOR SELECT USING (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Youth advisor: select own farmers" ON "public"."animal_husbandry_farmers" FOR SELECT USING (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Youth advisor: select own fishing clients" ON "public"."fishing_clients" FOR SELECT USING (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Youth advisor: select own fishing consultations" ON "public"."fishing_consultations" FOR SELECT USING (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Youth advisor: update own ag consultations" ON "public"."agriculture_consultations" FOR UPDATE USING (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Youth advisor: update own ag farmers" ON "public"."agriculture_farmers" FOR UPDATE USING (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Youth advisor: update own consultations" ON "public"."animal_husbandry_consultations" FOR UPDATE USING (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Youth advisor: update own farmers" ON "public"."animal_husbandry_farmers" FOR UPDATE USING (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Youth advisor: update own fishing clients" ON "public"."fishing_clients" FOR UPDATE USING (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "Youth advisor: update own fishing consultations" ON "public"."fishing_consultations" FOR UPDATE USING (("auth"."uid"() = "youth_user_id"));



CREATE POLICY "active_programs_public" ON "public"."research_programs" FOR SELECT USING (("status" = 'active'::"text"));



CREATE POLICY "admin_read" ON "public"."api_cost_log" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."agent_conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agents_owner_all" ON "public"."agents" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "agents_shared_read" ON "public"."agents" FOR SELECT USING (("is_shared" = true));



ALTER TABLE "public"."agriculture_consultations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agriculture_farmers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_playground_chats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "all_programs_authenticated" ON "public"."research_programs" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."animal_husbandry_consultations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."animal_husbandry_farmers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "anyone_reads_active_challenges" ON "public"."community_challenges" FOR SELECT USING (("active" = true));



CREATE POLICY "anyone_reads_quarters" ON "public"."grand_challenge_quarters" FOR SELECT USING (true);



ALTER TABLE "public"."api_cost_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assessments_monthly_global" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated_reads_all_challenges" ON "public"."community_challenges" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated_reads_all_enrollments" ON "public"."challenge_enrollments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated_users_can_create_org" ON "public"."organizations" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "board_members_read_authenticated" ON "public"."research_board_members" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."certification_assessments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "certification_assessments_delete" ON "public"."certification_assessments" FOR DELETE TO "authenticated" USING ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text"));



CREATE POLICY "certification_assessments_insert" ON "public"."certification_assessments" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text"));



CREATE POLICY "certification_assessments_select" ON "public"."certification_assessments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "certification_assessments_update" ON "public"."certification_assessments" FOR UPDATE TO "authenticated" USING ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text")) WITH CHECK ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text"));



ALTER TABLE "public"."challenge_enrollments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_challenges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_impact_journal" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_impact_tiers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."consultation_evidence_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_owner_all" ON "public"."agent_conversations" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."daily_activity_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_activity_log_insert" ON "public"."daily_activity_log" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text"));



CREATE POLICY "daily_activity_log_select" ON "public"."daily_activity_log" FOR SELECT TO "authenticated" USING ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = ANY (ARRAY['platform_administrator'::"text", 'teacher'::"text", 'site_leader'::"text", 'facilitator'::"text", 'leader'::"text", 'research_lead'::"text"])));



CREATE POLICY "daily_activity_log_update" ON "public"."daily_activity_log" FOR UPDATE TO "authenticated" USING ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text")) WITH CHECK ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text"));



ALTER TABLE "public"."daily_reflections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dashboard" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dashboard_insert" ON "public"."dashboard" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) OR (( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text")));



CREATE POLICY "dashboard_select" ON "public"."dashboard" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text") OR ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = ANY (ARRAY['teacher'::"text", 'site_leader'::"text", 'facilitator'::"text", 'leader'::"text", 'research_lead'::"text"])) AND ("user_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."organization_id" = ( SELECT "get_my_profile"."organization_id"
           FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")))))) OR ("user_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."organization_id" = ( SELECT "get_my_profile"."organization_id"
           FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")))))));



ALTER TABLE "public"."dashboard_stats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dashboard_stats: research read" ON "public"."dashboard_stats" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['research_lead'::"public"."user_role", 'platform_administrator'::"public"."user_role", 'site_leader'::"public"."user_role"]))))));



CREATE POLICY "dashboard_stats: service write" ON "public"."dashboard_stats" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'platform_administrator'::"public"."user_role")))));



CREATE POLICY "dashboard_update" ON "public"."dashboard" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text") OR ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = ANY (ARRAY['teacher'::"text", 'site_leader'::"text", 'facilitator'::"text", 'leader'::"text", 'research_lead'::"text"])) AND ("user_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."organization_id" = ( SELECT "get_my_profile"."organization_id"
           FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")))))))) WITH CHECK ((("user_id" = "auth"."uid"()) OR (( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text") OR ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = ANY (ARRAY['teacher'::"text", 'site_leader'::"text", 'facilitator'::"text", 'leader'::"text", 'research_lead'::"text"])) AND ("user_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."organization_id" = ( SELECT "get_my_profile"."organization_id"
           FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id"))))))));



ALTER TABLE "public"."debrief_questions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ec_delete_own" ON "public"."entrepreneurship_clients" FOR DELETE USING (("youth_user_id" = "auth"."uid"()));



CREATE POLICY "ec_insert_own" ON "public"."entrepreneurship_clients" FOR INSERT WITH CHECK (("youth_user_id" = "auth"."uid"()));



CREATE POLICY "ec_select_own" ON "public"."entrepreneurship_clients" FOR SELECT USING (("youth_user_id" = "auth"."uid"()));



CREATE POLICY "ec_update_own" ON "public"."entrepreneurship_clients" FOR UPDATE USING (("youth_user_id" = "auth"."uid"()));



CREATE POLICY "econ_delete_own" ON "public"."entrepreneurship_consultations" FOR DELETE USING (("youth_user_id" = "auth"."uid"()));



CREATE POLICY "econ_insert_own" ON "public"."entrepreneurship_consultations" FOR INSERT WITH CHECK (("youth_user_id" = "auth"."uid"()));



CREATE POLICY "econ_select_own" ON "public"."entrepreneurship_consultations" FOR SELECT USING (("youth_user_id" = "auth"."uid"()));



CREATE POLICY "econ_update_own" ON "public"."entrepreneurship_consultations" FOR UPDATE USING (("youth_user_id" = "auth"."uid"()));



ALTER TABLE "public"."enterprise_ledger_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."entrepreneurship_clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."entrepreneurship_consultations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fishing_clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fishing_consultations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."grand_challenge_quarters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."grand_challenge_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."health_assessments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."health_patients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."image_generations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert_programs_authenticated" ON "public"."research_programs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "leader_can_set_leader_id" ON "public"."organizations" FOR UPDATE TO "authenticated" USING ((("leader_id" IS NULL) OR ("leader_id" = "auth"."uid"()))) WITH CHECK (true);



CREATE POLICY "leader_own_org" ON "public"."organizations" TO "authenticated" USING (("leader_id" = "auth"."uid"())) WITH CHECK (("leader_id" = "auth"."uid"()));



CREATE POLICY "learners_own_enrollments" ON "public"."challenge_enrollments" USING (("auth"."uid"() = "learner_id"));



CREATE POLICY "learners_own_journal" ON "public"."community_impact_journal" USING (("auth"."uid"() = "learner_id"));



CREATE POLICY "learners_own_submissions" ON "public"."grand_challenge_submissions" USING (("auth"."uid"() = "learner_id"));



CREATE POLICY "learners_read_own_tiers" ON "public"."community_impact_tiers" FOR SELECT USING (("auth"."uid"() = "learner_id"));



ALTER TABLE "public"."learning_modules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_owner_all" ON "public"."agent_messages" USING ((EXISTS ( SELECT 1
   FROM "public"."agent_conversations" "ac"
  WHERE (("ac"."id" = "agent_messages"."conversation_id") AND ("ac"."user_id" = "auth"."uid"())))));



CREATE POLICY "navigator own assessments" ON "public"."health_assessments" USING (("youth_user_id" = "auth"."uid"())) WITH CHECK (("youth_user_id" = "auth"."uid"()));



CREATE POLICY "navigator own patients" ON "public"."health_patients" USING (("youth_user_id" = "auth"."uid"())) WITH CHECK (("youth_user_id" = "auth"."uid"()));



ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "own context only" ON "public"."playground_context" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."phase_eligibility_thresholds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform_admin_all" ON "public"."organizations" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'platform_administrator'::"public"."user_role")))));



ALTER TABLE "public"."platform_news" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform_news_delete" ON "public"."platform_news" FOR DELETE TO "authenticated" USING ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text"));



CREATE POLICY "platform_news_insert" ON "public"."platform_news" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = ANY (ARRAY['platform_administrator'::"text", 'site_leader'::"text", 'teacher'::"text", 'facilitator'::"text"])));



CREATE POLICY "platform_news_select_anon" ON "public"."platform_news" FOR SELECT TO "anon" USING (("active" = true));



CREATE POLICY "platform_news_select_auth" ON "public"."platform_news" FOR SELECT TO "authenticated" USING ((("active" = true) AND (("organization_ids" IS NULL) OR ("organization_ids" @> ARRAY[( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())
 LIMIT 1)]))));



CREATE POLICY "platform_news_update" ON "public"."platform_news" FOR UPDATE TO "authenticated" USING ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = ANY (ARRAY['platform_administrator'::"text", 'site_leader'::"text", 'teacher'::"text", 'facilitator'::"text"]))) WITH CHECK ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = ANY (ARRAY['platform_administrator'::"text", 'site_leader'::"text", 'teacher'::"text", 'facilitator'::"text"])));



CREATE POLICY "platform_reads_all_tiers" ON "public"."community_impact_tiers" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "platform_reads_journal" ON "public"."community_impact_journal" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "platform_reads_submissions" ON "public"."grand_challenge_submissions" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."playground_context" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR (( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text") OR ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = ANY (ARRAY['teacher'::"text", 'site_leader'::"text", 'facilitator'::"text", 'leader'::"text", 'research_lead'::"text"])) AND ("organization_id" = ( SELECT "get_my_profile"."organization_id"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id"))))));



CREATE POLICY "profiles_update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("id" = "auth"."uid"()) OR (( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text") OR ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'site_leader'::"text") AND ("organization_id" = ( SELECT "get_my_profile"."organization_id"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")))))) WITH CHECK ((("id" = "auth"."uid"()) OR (( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text") OR ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'site_leader'::"text") AND ("organization_id" = ( SELECT "get_my_profile"."organization_id"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id"))))));



ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public_read_assessments_monthly_global" ON "public"."assessments_monthly_global" FOR SELECT USING (true);



CREATE POLICY "public_read_by_join_code" ON "public"."organizations" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."research_ai_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."research_badges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."research_board_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."research_findings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."research_guiding_questions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "research_guiding_questions: authenticated read" ON "public"."research_guiding_questions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "research_guiding_questions: write delete" ON "public"."research_guiding_questions" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['platform_administrator'::"public"."user_role", 'site_leader'::"public"."user_role", 'research_lead'::"public"."user_role"]))))));



CREATE POLICY "research_guiding_questions: write insert" ON "public"."research_guiding_questions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['platform_administrator'::"public"."user_role", 'site_leader'::"public"."user_role", 'research_lead'::"public"."user_role"]))))));



CREATE POLICY "research_guiding_questions: write update" ON "public"."research_guiding_questions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['platform_administrator'::"public"."user_role", 'site_leader'::"public"."user_role", 'research_lead'::"public"."user_role"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['platform_administrator'::"public"."user_role", 'site_leader'::"public"."user_role", 'research_lead'::"public"."user_role"]))))));



ALTER TABLE "public"."research_phases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."research_platform_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."research_programs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "research_programs: authenticated read" ON "public"."research_programs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "research_programs: write delete" ON "public"."research_programs" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['platform_administrator'::"public"."user_role", 'site_leader'::"public"."user_role", 'research_lead'::"public"."user_role"]))))));



CREATE POLICY "research_programs: write insert" ON "public"."research_programs" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['platform_administrator'::"public"."user_role", 'site_leader'::"public"."user_role", 'research_lead'::"public"."user_role"]))))));



CREATE POLICY "research_programs: write update" ON "public"."research_programs" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['platform_administrator'::"public"."user_role", 'site_leader'::"public"."user_role", 'research_lead'::"public"."user_role"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['platform_administrator'::"public"."user_role", 'site_leader'::"public"."user_role", 'research_lead'::"public"."user_role"]))))));



ALTER TABLE "public"."research_studies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."research_task_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."research_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."research_team_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."research_teams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."researcher_contribution_summary" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."researcher_contributions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."researcher_phase_debriefs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."researcher_portfolios" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_manages_challenges" ON "public"."community_challenges" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_manages_enrollments" ON "public"."challenge_enrollments" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_manages_journal" ON "public"."community_impact_journal" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_manages_quarters" ON "public"."grand_challenge_quarters" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_manages_submissions" ON "public"."grand_challenge_submissions" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_manages_tiers" ON "public"."community_impact_tiers" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_role_all" ON "public"."api_cost_log" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."site_mentor_presence" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "site_mentor_presence_insert" ON "public"."site_mentor_presence" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = ANY (ARRAY['platform_administrator'::"text", 'site_leader'::"text"])));



CREATE POLICY "site_mentor_presence_select" ON "public"."site_mentor_presence" FOR SELECT TO "authenticated" USING ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = ANY (ARRAY['platform_administrator'::"text", 'site_leader'::"text", 'teacher'::"text", 'facilitator'::"text", 'leader'::"text", 'research_lead'::"text"])));



CREATE POLICY "site_mentor_presence_update" ON "public"."site_mentor_presence" FOR UPDATE TO "authenticated" USING ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = ANY (ARRAY['platform_administrator'::"text", 'site_leader'::"text"]))) WITH CHECK ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = ANY (ARRAY['platform_administrator'::"text", 'site_leader'::"text"])));



ALTER TABLE "public"."system_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "team_members_insert" ON "public"."team_members" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) OR (( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text") OR ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = ANY (ARRAY['teacher'::"text", 'site_leader'::"text", 'facilitator'::"text", 'leader'::"text", 'research_lead'::"text"])) AND ("team_id" IN ( SELECT "teams"."id"
   FROM "public"."teams"
  WHERE ("teams"."organization_id" = ( SELECT "get_my_profile"."organization_id"
           FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id"))))))));



CREATE POLICY "team_members_select" ON "public"."team_members" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text") OR ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = ANY (ARRAY['teacher'::"text", 'site_leader'::"text", 'facilitator'::"text", 'leader'::"text", 'research_lead'::"text"])) AND ("team_id" IN ( SELECT "teams"."id"
   FROM "public"."teams"
  WHERE ("teams"."organization_id" = ( SELECT "get_my_profile"."organization_id"
           FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")))))) OR ("team_id" IN ( SELECT "team_members_1"."team_id"
   FROM "public"."team_members" "team_members_1"
  WHERE ("team_members_1"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "teams_insert" ON "public"."teams" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND ("organization_id" = ( SELECT "get_my_profile"."organization_id"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")))));



CREATE POLICY "teams_select" ON "public"."teams" FOR SELECT TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR (( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text") OR ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = ANY (ARRAY['teacher'::"text", 'site_leader'::"text", 'facilitator'::"text", 'leader'::"text", 'research_lead'::"text"])) AND ("organization_id" = ( SELECT "get_my_profile"."organization_id"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")))) OR ("id" IN ( SELECT "team_members"."team_id"
   FROM "public"."team_members"
  WHERE ("team_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "teams_update" ON "public"."teams" FOR UPDATE TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR (( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text") OR ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = ANY (ARRAY['teacher'::"text", 'site_leader'::"text", 'facilitator'::"text", 'leader'::"text", 'research_lead'::"text"])) AND ("organization_id" = ( SELECT "get_my_profile"."organization_id"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")))))) WITH CHECK ((("created_by" = "auth"."uid"()) OR (( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text") OR ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = ANY (ARRAY['teacher'::"text", 'site_leader'::"text", 'facilitator'::"text", 'leader'::"text", 'research_lead'::"text"])) AND ("organization_id" = ( SELECT "get_my_profile"."organization_id"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id"))))));



ALTER TABLE "public"."tech_skills_progress" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tech_skills_progress_insert" ON "public"."tech_skills_progress" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) OR (( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text")));



CREATE POLICY "tech_skills_progress_select" ON "public"."tech_skills_progress" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text") OR ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = ANY (ARRAY['teacher'::"text", 'site_leader'::"text", 'facilitator'::"text", 'leader'::"text", 'research_lead'::"text"])) AND ("user_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."organization_id" = ( SELECT "get_my_profile"."organization_id"
           FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")))))) OR ("user_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."organization_id" = ( SELECT "get_my_profile"."organization_id"
           FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")))))));



CREATE POLICY "tech_skills_progress_update" ON "public"."tech_skills_progress" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text") OR ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = ANY (ARRAY['teacher'::"text", 'site_leader'::"text", 'facilitator'::"text", 'leader'::"text", 'research_lead'::"text"])) AND ("user_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."organization_id" = ( SELECT "get_my_profile"."organization_id"
           FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")))))))) WITH CHECK ((("user_id" = "auth"."uid"()) OR (( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text") OR ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = ANY (ARRAY['teacher'::"text", 'site_leader'::"text", 'facilitator'::"text", 'leader'::"text", 'research_lead'::"text"])) AND ("user_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."organization_id" = ( SELECT "get_my_profile"."organization_id"
           FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id"))))))));



ALTER TABLE "public"."triage_dedup" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_monthly_assessments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_monthly_assessments_insert" ON "public"."user_monthly_assessments" FOR INSERT TO "authenticated", "service_role" WITH CHECK (((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text") OR ("auth"."role"() = 'service_role'::"text")));



CREATE POLICY "user_monthly_assessments_select" ON "public"."user_monthly_assessments" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text") OR ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = ANY (ARRAY['teacher'::"text", 'site_leader'::"text", 'facilitator'::"text", 'leader'::"text", 'research_lead'::"text"])) AND ("user_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."organization_id" = ( SELECT "get_my_profile"."organization_id"
           FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id"))))))));



CREATE POLICY "user_monthly_assessments_update" ON "public"."user_monthly_assessments" FOR UPDATE TO "authenticated" USING ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text")) WITH CHECK ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text"));



ALTER TABLE "public"."user_personality_baseline" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_personality_baseline_insert" ON "public"."user_personality_baseline" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) OR (( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text")));



CREATE POLICY "user_personality_baseline_select" ON "public"."user_personality_baseline" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text") OR ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = ANY (ARRAY['teacher'::"text", 'site_leader'::"text", 'facilitator'::"text", 'leader'::"text", 'research_lead'::"text"])) AND ("user_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."organization_id" = ( SELECT "get_my_profile"."organization_id"
           FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id"))))))));



CREATE POLICY "user_personality_baseline_update" ON "public"."user_personality_baseline" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text"))) WITH CHECK ((("user_id" = "auth"."uid"()) OR (( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text")));



CREATE POLICY "users_own_profile_insert" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "users_own_projects" ON "public"."video_studio_projects" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."vibe_coding_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."video_generations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."video_studio_projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."voice_generations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_challenge_projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_champions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "weekly_champions_insert" ON "public"."weekly_champions" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text"));



CREATE POLICY "weekly_champions_select_anon" ON "public"."weekly_champions" FOR SELECT TO "anon" USING (true);



CREATE POLICY "weekly_champions_select_auth" ON "public"."weekly_champions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "weekly_champions_update" ON "public"."weekly_champions" FOR UPDATE TO "authenticated" USING ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text")) WITH CHECK ((( SELECT "get_my_profile"."role"
   FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'::"text"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."add_org_join_code"("org_id" "uuid", "requesting_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."add_org_join_code"("org_id" "uuid", "requesting_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_org_join_code"("org_id" "uuid", "requesting_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."award_bridge_tier_on_referral"() TO "anon";
GRANT ALL ON FUNCTION "public"."award_bridge_tier_on_referral"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."award_bridge_tier_on_referral"() TO "service_role";



GRANT ALL ON FUNCTION "public"."award_multiplier_on_mentee_completion"() TO "anon";
GRANT ALL ON FUNCTION "public"."award_multiplier_on_mentee_completion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."award_multiplier_on_mentee_completion"() TO "service_role";



GRANT ALL ON FUNCTION "public"."backfill_dashboard_stats"("start_date" "date", "end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."backfill_dashboard_stats"("start_date" "date", "end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."backfill_dashboard_stats"("start_date" "date", "end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."carry_over_grand_submission"("p_source_id" "uuid", "p_learner_id" "uuid", "p_new_quarter" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."carry_over_grand_submission"("p_source_id" "uuid", "p_learner_id" "uuid", "p_new_quarter" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."carry_over_grand_submission"("p_source_id" "uuid", "p_learner_id" "uuid", "p_new_quarter" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."close_grand_challenge_quarter"("p_quarter" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."close_grand_challenge_quarter"("p_quarter" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."close_grand_challenge_quarter"("p_quarter" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_grade_appropriate_dashboard_activities_by_continent"("user_id_param" "uuid", "continent_param" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_grade_appropriate_dashboard_activities_by_continent"("user_id_param" "uuid", "continent_param" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_grade_appropriate_dashboard_activities_by_continent"("user_id_param" "uuid", "continent_param" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_grade_appropriate_dashboard_activities_by_country"("user_id_param" "uuid", "country_param" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_grade_appropriate_dashboard_activities_by_country"("user_id_param" "uuid", "country_param" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_grade_appropriate_dashboard_activities_by_country"("user_id_param" "uuid", "country_param" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_from_leaderboard_view"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_from_leaderboard_view"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_from_leaderboard_view"() TO "service_role";



GRANT ALL ON FUNCTION "public"."expire_old_enrollments"() TO "anon";
GRANT ALL ON FUNCTION "public"."expire_old_enrollments"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_old_enrollments"() TO "service_role";



GRANT ALL ON FUNCTION "public"."find_org_by_join_code"("lookup_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."find_org_by_join_code"("lookup_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_org_by_join_code"("lookup_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_join_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_join_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_join_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_team_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_team_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_team_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dashboard_summary"("user_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_summary"("user_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_summary"("user_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_longitudinal_summary"("p_site" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_longitudinal_summary"("p_site" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_longitudinal_summary"("p_site" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_profile"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_research_snapshot"("p_site" "text", "p_from_month" "text", "p_to_month" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_research_snapshot"("p_site" "text", "p_from_month" "text", "p_to_month" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_research_snapshot"("p_site" "text", "p_from_month" "text", "p_to_month" "text") TO "service_role";



GRANT ALL ON TABLE "public"."dashboard_stats" TO "anon";
GRANT ALL ON TABLE "public"."dashboard_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."dashboard_stats" TO "service_role";



GRANT ALL ON TABLE "public"."research_data_view" TO "anon";
GRANT ALL ON TABLE "public"."research_data_view" TO "authenticated";
GRANT ALL ON TABLE "public"."research_data_view" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_research_snapshot"("p_site" "text", "p_from_date" "date", "p_to_date" "date", "p_granularity" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_research_snapshot"("p_site" "text", "p_from_date" "date", "p_to_date" "date", "p_granularity" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_research_snapshot"("p_site" "text", "p_from_date" "date", "p_to_date" "date", "p_granularity" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_session_band_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_session_band_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_session_band_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."grade_band"("p_grade" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."grade_band"("p_grade" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."grade_band"("p_grade" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."learner_token"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."learner_token"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."learner_token"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_contribution_summary"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_contribution_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_contribution_summary"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_dashboard"("user_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_dashboard"("user_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_dashboard"("user_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_user_dashboard"("user_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_user_dashboard"("user_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_user_dashboard"("user_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_site"("p_city" "text", "p_country" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_site"("p_city" "text", "p_country" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_site"("p_city" "text", "p_country" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_org_leader_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_org_leader_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_org_leader_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_team_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_team_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_team_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_team_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_team_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_team_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_current_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_current_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_current_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tier_rank"("tier" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."tier_rank"("tier" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tier_rank"("tier" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_agc_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_agc_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_agc_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_agf_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_agf_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_agf_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_ahc_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ahc_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ahc_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_ahf_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ahf_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ahf_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_ec_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ec_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ec_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_econ_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_econ_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_econ_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_fc_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_fc_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_fc_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_fcon_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_fcon_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_fcon_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_ha_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ha_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ha_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_hp_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_hp_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_hp_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_grand"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_grand"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_grand"() TO "service_role";



GRANT ALL ON TABLE "public"."agent_conversations" TO "anon";
GRANT ALL ON TABLE "public"."agent_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."agent_messages" TO "anon";
GRANT ALL ON TABLE "public"."agent_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_messages" TO "service_role";



GRANT ALL ON TABLE "public"."agents" TO "anon";
GRANT ALL ON TABLE "public"."agents" TO "authenticated";
GRANT ALL ON TABLE "public"."agents" TO "service_role";



GRANT ALL ON TABLE "public"."agriculture_consultations" TO "anon";
GRANT ALL ON TABLE "public"."agriculture_consultations" TO "authenticated";
GRANT ALL ON TABLE "public"."agriculture_consultations" TO "service_role";



GRANT ALL ON TABLE "public"."agriculture_farmer_summary" TO "anon";
GRANT ALL ON TABLE "public"."agriculture_farmer_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."agriculture_farmer_summary" TO "service_role";



GRANT ALL ON TABLE "public"."agriculture_farmers" TO "anon";
GRANT ALL ON TABLE "public"."agriculture_farmers" TO "authenticated";
GRANT ALL ON TABLE "public"."agriculture_farmers" TO "service_role";



GRANT ALL ON TABLE "public"."agriculture_open_followups" TO "anon";
GRANT ALL ON TABLE "public"."agriculture_open_followups" TO "authenticated";
GRANT ALL ON TABLE "public"."agriculture_open_followups" TO "service_role";



GRANT ALL ON TABLE "public"."ai_playground_chats" TO "anon";
GRANT ALL ON TABLE "public"."ai_playground_chats" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_playground_chats" TO "service_role";



GRANT ALL ON TABLE "public"."animal_husbandry_consultations" TO "anon";
GRANT ALL ON TABLE "public"."animal_husbandry_consultations" TO "authenticated";
GRANT ALL ON TABLE "public"."animal_husbandry_consultations" TO "service_role";



GRANT ALL ON TABLE "public"."animal_husbandry_farmer_summary" TO "anon";
GRANT ALL ON TABLE "public"."animal_husbandry_farmer_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."animal_husbandry_farmer_summary" TO "service_role";



GRANT ALL ON TABLE "public"."animal_husbandry_farmers" TO "anon";
GRANT ALL ON TABLE "public"."animal_husbandry_farmers" TO "authenticated";
GRANT ALL ON TABLE "public"."animal_husbandry_farmers" TO "service_role";



GRANT ALL ON TABLE "public"."animal_husbandry_open_followups" TO "anon";
GRANT ALL ON TABLE "public"."animal_husbandry_open_followups" TO "authenticated";
GRANT ALL ON TABLE "public"."animal_husbandry_open_followups" TO "service_role";



GRANT ALL ON TABLE "public"."api_cost_log" TO "anon";
GRANT ALL ON TABLE "public"."api_cost_log" TO "authenticated";
GRANT ALL ON TABLE "public"."api_cost_log" TO "service_role";



GRANT ALL ON TABLE "public"."assessments_monthly_global" TO "anon";
GRANT ALL ON TABLE "public"."assessments_monthly_global" TO "authenticated";
GRANT ALL ON TABLE "public"."assessments_monthly_global" TO "service_role";



GRANT ALL ON TABLE "public"."certification_assessments" TO "anon";
GRANT ALL ON TABLE "public"."certification_assessments" TO "authenticated";
GRANT ALL ON TABLE "public"."certification_assessments" TO "service_role";



GRANT ALL ON TABLE "public"."challenge_enrollments" TO "anon";
GRANT ALL ON TABLE "public"."challenge_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."challenge_enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."community_challenges" TO "anon";
GRANT ALL ON TABLE "public"."community_challenges" TO "authenticated";
GRANT ALL ON TABLE "public"."community_challenges" TO "service_role";



GRANT ALL ON TABLE "public"."community_impact_journal" TO "anon";
GRANT ALL ON TABLE "public"."community_impact_journal" TO "authenticated";
GRANT ALL ON TABLE "public"."community_impact_journal" TO "service_role";



GRANT ALL ON TABLE "public"."entrepreneurship_consultations" TO "anon";
GRANT ALL ON TABLE "public"."entrepreneurship_consultations" TO "authenticated";
GRANT ALL ON TABLE "public"."entrepreneurship_consultations" TO "service_role";



GRANT ALL ON TABLE "public"."fishing_consultations" TO "anon";
GRANT ALL ON TABLE "public"."fishing_consultations" TO "authenticated";
GRANT ALL ON TABLE "public"."fishing_consultations" TO "service_role";



GRANT ALL ON TABLE "public"."health_assessments" TO "anon";
GRANT ALL ON TABLE "public"."health_assessments" TO "authenticated";
GRANT ALL ON TABLE "public"."health_assessments" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."community_impact_resolutions" TO "anon";
GRANT ALL ON TABLE "public"."community_impact_resolutions" TO "authenticated";
GRANT ALL ON TABLE "public"."community_impact_resolutions" TO "service_role";



GRANT ALL ON TABLE "public"."community_impact_tiers" TO "anon";
GRANT ALL ON TABLE "public"."community_impact_tiers" TO "authenticated";
GRANT ALL ON TABLE "public"."community_impact_tiers" TO "service_role";



GRANT ALL ON TABLE "public"."community_leaderboard" TO "anon";
GRANT ALL ON TABLE "public"."community_leaderboard" TO "authenticated";
GRANT ALL ON TABLE "public"."community_leaderboard" TO "service_role";



GRANT ALL ON TABLE "public"."consultation_evidence_links" TO "anon";
GRANT ALL ON TABLE "public"."consultation_evidence_links" TO "authenticated";
GRANT ALL ON TABLE "public"."consultation_evidence_links" TO "service_role";



GRANT ALL ON TABLE "public"."cowork_eligible_users" TO "anon";
GRANT ALL ON TABLE "public"."cowork_eligible_users" TO "authenticated";
GRANT ALL ON TABLE "public"."cowork_eligible_users" TO "service_role";



GRANT ALL ON TABLE "public"."current_challenge_leaderboard" TO "anon";
GRANT ALL ON TABLE "public"."current_challenge_leaderboard" TO "authenticated";
GRANT ALL ON TABLE "public"."current_challenge_leaderboard" TO "service_role";



GRANT ALL ON TABLE "public"."daily_activity_log" TO "anon";
GRANT ALL ON TABLE "public"."daily_activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_activity_log" TO "service_role";



GRANT ALL ON TABLE "public"."daily_reflections" TO "anon";
GRANT ALL ON TABLE "public"."daily_reflections" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_reflections" TO "service_role";



GRANT ALL ON TABLE "public"."dashboard" TO "anon";
GRANT ALL ON TABLE "public"."dashboard" TO "authenticated";
GRANT ALL ON TABLE "public"."dashboard" TO "service_role";



GRANT ALL ON TABLE "public"."dashboard_activity_streams" TO "anon";
GRANT ALL ON TABLE "public"."dashboard_activity_streams" TO "authenticated";
GRANT ALL ON TABLE "public"."dashboard_activity_streams" TO "service_role";



GRANT ALL ON TABLE "public"."dashboard_stats_alltime" TO "anon";
GRANT ALL ON TABLE "public"."dashboard_stats_alltime" TO "authenticated";
GRANT ALL ON TABLE "public"."dashboard_stats_alltime" TO "service_role";



GRANT ALL ON TABLE "public"."dashboard_stats_public" TO "anon";
GRANT ALL ON TABLE "public"."dashboard_stats_public" TO "authenticated";
GRANT ALL ON TABLE "public"."dashboard_stats_public" TO "service_role";



GRANT ALL ON TABLE "public"."debrief_questions" TO "anon";
GRANT ALL ON TABLE "public"."debrief_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."debrief_questions" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_ledger_entries" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_ledger_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_ledger_entries" TO "service_role";



GRANT ALL ON TABLE "public"."enterprise_ledger_admin" TO "anon";
GRANT ALL ON TABLE "public"."enterprise_ledger_admin" TO "authenticated";
GRANT ALL ON TABLE "public"."enterprise_ledger_admin" TO "service_role";



GRANT ALL ON TABLE "public"."entrepreneurship_client_summary" TO "anon";
GRANT ALL ON TABLE "public"."entrepreneurship_client_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."entrepreneurship_client_summary" TO "service_role";



GRANT ALL ON TABLE "public"."entrepreneurship_clients" TO "anon";
GRANT ALL ON TABLE "public"."entrepreneurship_clients" TO "authenticated";
GRANT ALL ON TABLE "public"."entrepreneurship_clients" TO "service_role";



GRANT ALL ON TABLE "public"."system_events" TO "anon";
GRANT ALL ON TABLE "public"."system_events" TO "authenticated";
GRANT ALL ON TABLE "public"."system_events" TO "service_role";



GRANT ALL ON TABLE "public"."fallback_daily_summary" TO "anon";
GRANT ALL ON TABLE "public"."fallback_daily_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."fallback_daily_summary" TO "service_role";



GRANT ALL ON TABLE "public"."fishing_client_summary" TO "anon";
GRANT ALL ON TABLE "public"."fishing_client_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."fishing_client_summary" TO "service_role";



GRANT ALL ON TABLE "public"."fishing_clients" TO "anon";
GRANT ALL ON TABLE "public"."fishing_clients" TO "authenticated";
GRANT ALL ON TABLE "public"."fishing_clients" TO "service_role";



GRANT ALL ON TABLE "public"."fishing_open_followups" TO "anon";
GRANT ALL ON TABLE "public"."fishing_open_followups" TO "authenticated";
GRANT ALL ON TABLE "public"."fishing_open_followups" TO "service_role";



GRANT ALL ON TABLE "public"."grand_challenge_submissions" TO "anon";
GRANT ALL ON TABLE "public"."grand_challenge_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."grand_challenge_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."grand_challenge_leaderboard" TO "anon";
GRANT ALL ON TABLE "public"."grand_challenge_leaderboard" TO "authenticated";
GRANT ALL ON TABLE "public"."grand_challenge_leaderboard" TO "service_role";



GRANT ALL ON TABLE "public"."grand_challenge_quarters" TO "anon";
GRANT ALL ON TABLE "public"."grand_challenge_quarters" TO "authenticated";
GRANT ALL ON TABLE "public"."grand_challenge_quarters" TO "service_role";



GRANT ALL ON TABLE "public"."health_patients" TO "anon";
GRANT ALL ON TABLE "public"."health_patients" TO "authenticated";
GRANT ALL ON TABLE "public"."health_patients" TO "service_role";



GRANT ALL ON TABLE "public"."health_open_followups" TO "anon";
GRANT ALL ON TABLE "public"."health_open_followups" TO "authenticated";
GRANT ALL ON TABLE "public"."health_open_followups" TO "service_role";



GRANT ALL ON TABLE "public"."health_patient_summary" TO "anon";
GRANT ALL ON TABLE "public"."health_patient_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."health_patient_summary" TO "service_role";



GRANT ALL ON TABLE "public"."image_generations" TO "anon";
GRANT ALL ON TABLE "public"."image_generations" TO "authenticated";
GRANT ALL ON TABLE "public"."image_generations" TO "service_role";



GRANT ALL ON TABLE "public"."learner_journal_summary" TO "anon";
GRANT ALL ON TABLE "public"."learner_journal_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."learner_journal_summary" TO "service_role";



GRANT ALL ON TABLE "public"."learning_modules" TO "anon";
GRANT ALL ON TABLE "public"."learning_modules" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_modules" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."org_summary" TO "anon";
GRANT ALL ON TABLE "public"."org_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."org_summary" TO "service_role";



GRANT ALL ON TABLE "public"."phase_eligibility_thresholds" TO "anon";
GRANT ALL ON TABLE "public"."phase_eligibility_thresholds" TO "authenticated";
GRANT ALL ON TABLE "public"."phase_eligibility_thresholds" TO "service_role";



GRANT ALL ON TABLE "public"."platform_news" TO "anon";
GRANT ALL ON TABLE "public"."platform_news" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_news" TO "service_role";



GRANT ALL ON SEQUENCE "public"."platform_news_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."platform_news_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."platform_news_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."playground_context" TO "anon";
GRANT ALL ON TABLE "public"."playground_context" TO "authenticated";
GRANT ALL ON TABLE "public"."playground_context" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."provider_health_24h" TO "anon";
GRANT ALL ON TABLE "public"."provider_health_24h" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_health_24h" TO "service_role";



GRANT ALL ON TABLE "public"."research_ai_sessions" TO "anon";
GRANT ALL ON TABLE "public"."research_ai_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."research_ai_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."research_badges" TO "anon";
GRANT ALL ON TABLE "public"."research_badges" TO "authenticated";
GRANT ALL ON TABLE "public"."research_badges" TO "service_role";



GRANT ALL ON TABLE "public"."research_board_members" TO "anon";
GRANT ALL ON TABLE "public"."research_board_members" TO "authenticated";
GRANT ALL ON TABLE "public"."research_board_members" TO "service_role";



GRANT ALL ON TABLE "public"."research_findings" TO "anon";
GRANT ALL ON TABLE "public"."research_findings" TO "authenticated";
GRANT ALL ON TABLE "public"."research_findings" TO "service_role";



GRANT ALL ON TABLE "public"."research_findings_latest" TO "anon";
GRANT ALL ON TABLE "public"."research_findings_latest" TO "authenticated";
GRANT ALL ON TABLE "public"."research_findings_latest" TO "service_role";



GRANT ALL ON TABLE "public"."research_guiding_questions" TO "anon";
GRANT ALL ON TABLE "public"."research_guiding_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."research_guiding_questions" TO "service_role";



GRANT ALL ON TABLE "public"."research_phases" TO "anon";
GRANT ALL ON TABLE "public"."research_phases" TO "authenticated";
GRANT ALL ON TABLE "public"."research_phases" TO "service_role";



GRANT ALL ON TABLE "public"."research_platform_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."research_platform_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."research_platform_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."research_programs" TO "anon";
GRANT ALL ON TABLE "public"."research_programs" TO "authenticated";
GRANT ALL ON TABLE "public"."research_programs" TO "service_role";



GRANT ALL ON TABLE "public"."research_studies" TO "anon";
GRANT ALL ON TABLE "public"."research_studies" TO "authenticated";
GRANT ALL ON TABLE "public"."research_studies" TO "service_role";



GRANT ALL ON TABLE "public"."research_task_progress" TO "anon";
GRANT ALL ON TABLE "public"."research_task_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."research_task_progress" TO "service_role";



GRANT ALL ON TABLE "public"."research_tasks" TO "anon";
GRANT ALL ON TABLE "public"."research_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."research_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."research_task_tree" TO "anon";
GRANT ALL ON TABLE "public"."research_task_tree" TO "authenticated";
GRANT ALL ON TABLE "public"."research_task_tree" TO "service_role";



GRANT ALL ON TABLE "public"."research_team_members" TO "anon";
GRANT ALL ON TABLE "public"."research_team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."research_team_members" TO "service_role";



GRANT ALL ON TABLE "public"."research_teams" TO "anon";
GRANT ALL ON TABLE "public"."research_teams" TO "authenticated";
GRANT ALL ON TABLE "public"."research_teams" TO "service_role";



GRANT ALL ON TABLE "public"."researcher_contribution_summary" TO "anon";
GRANT ALL ON TABLE "public"."researcher_contribution_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."researcher_contribution_summary" TO "service_role";



GRANT ALL ON TABLE "public"."researcher_contributions" TO "anon";
GRANT ALL ON TABLE "public"."researcher_contributions" TO "authenticated";
GRANT ALL ON TABLE "public"."researcher_contributions" TO "service_role";



GRANT ALL ON TABLE "public"."researcher_phase_debriefs" TO "anon";
GRANT ALL ON TABLE "public"."researcher_phase_debriefs" TO "authenticated";
GRANT ALL ON TABLE "public"."researcher_phase_debriefs" TO "service_role";



GRANT ALL ON TABLE "public"."researcher_credential_eligibility" TO "anon";
GRANT ALL ON TABLE "public"."researcher_credential_eligibility" TO "authenticated";
GRANT ALL ON TABLE "public"."researcher_credential_eligibility" TO "service_role";



GRANT ALL ON TABLE "public"."researcher_dashboard" TO "anon";
GRANT ALL ON TABLE "public"."researcher_dashboard" TO "authenticated";
GRANT ALL ON TABLE "public"."researcher_dashboard" TO "service_role";



GRANT ALL ON TABLE "public"."researcher_portfolios" TO "anon";
GRANT ALL ON TABLE "public"."researcher_portfolios" TO "authenticated";
GRANT ALL ON TABLE "public"."researcher_portfolios" TO "service_role";



GRANT ALL ON TABLE "public"."site_mentor_presence" TO "anon";
GRANT ALL ON TABLE "public"."site_mentor_presence" TO "authenticated";
GRANT ALL ON TABLE "public"."site_mentor_presence" TO "service_role";



GRANT ALL ON TABLE "public"."team_members" TO "anon";
GRANT ALL ON TABLE "public"."team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."team_members" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."tech_skills_progress" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."tech_skills_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."tech_skills_progress" TO "service_role";



GRANT ALL ON TABLE "public"."tech_skills_progress_admin" TO "anon";
GRANT ALL ON TABLE "public"."tech_skills_progress_admin" TO "authenticated";
GRANT ALL ON TABLE "public"."tech_skills_progress_admin" TO "service_role";



GRANT ALL ON TABLE "public"."triage_dedup" TO "anon";
GRANT ALL ON TABLE "public"."triage_dedup" TO "authenticated";
GRANT ALL ON TABLE "public"."triage_dedup" TO "service_role";



GRANT ALL ON TABLE "public"."user_monthly_assessments" TO "anon";
GRANT ALL ON TABLE "public"."user_monthly_assessments" TO "authenticated";
GRANT ALL ON TABLE "public"."user_monthly_assessments" TO "service_role";



GRANT ALL ON TABLE "public"."user_personality_baseline" TO "anon";
GRANT ALL ON TABLE "public"."user_personality_baseline" TO "authenticated";
GRANT ALL ON TABLE "public"."user_personality_baseline" TO "service_role";



GRANT ALL ON TABLE "public"."v_event_frequency" TO "anon";
GRANT ALL ON TABLE "public"."v_event_frequency" TO "authenticated";
GRANT ALL ON TABLE "public"."v_event_frequency" TO "service_role";



GRANT ALL ON TABLE "public"."v_recent_errors" TO "anon";
GRANT ALL ON TABLE "public"."v_recent_errors" TO "authenticated";
GRANT ALL ON TABLE "public"."v_recent_errors" TO "service_role";



GRANT ALL ON TABLE "public"."vibe_coding_sessions" TO "anon";
GRANT ALL ON TABLE "public"."vibe_coding_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."vibe_coding_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."video_generations" TO "anon";
GRANT ALL ON TABLE "public"."video_generations" TO "authenticated";
GRANT ALL ON TABLE "public"."video_generations" TO "service_role";



GRANT ALL ON TABLE "public"."video_studio_projects" TO "anon";
GRANT ALL ON TABLE "public"."video_studio_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."video_studio_projects" TO "service_role";



GRANT ALL ON TABLE "public"."voice_generations" TO "anon";
GRANT ALL ON TABLE "public"."voice_generations" TO "authenticated";
GRANT ALL ON TABLE "public"."voice_generations" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_challenge_projects" TO "anon";
GRANT ALL ON TABLE "public"."weekly_challenge_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_challenge_projects" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_champions" TO "anon";
GRANT ALL ON TABLE "public"."weekly_champions" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_champions" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






