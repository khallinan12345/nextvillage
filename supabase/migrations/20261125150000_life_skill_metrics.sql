-- Life-skill metrics (4/5 and 5/5 of the series: the actual rollups).
-- Builds Grit, Independence, Feedback-responsiveness and Uphold Community
-- Standards from data the previous three migrations put in place:
--   20261125120000_evaluation_history.sql   (attempt-over-time scores)
--   20261125130000_safety_flag_disposition.sql (confirmed vs. dismissed)
--   20261125140000_hint_used_count.sql      (self-resolve vs. hint usage)
-- Nothing here is backfilled — every metric reflects only activity from
-- the day each underlying piece shipped forward.

-- ── Small jsonb-criteria helpers, shared by the main computation below ──────

CREATE OR REPLACE FUNCTION public.weakest_criterion(p_criteria jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object('key', c->>'key', 'score', (c->>'score')::numeric)
  FROM jsonb_array_elements(COALESCE(p_criteria, '[]'::jsonb)) c
  WHERE c->>'score' ~ '^-?[0-9.]+$'
  ORDER BY (c->>'score')::numeric ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.criterion_score(p_criteria jsonb, p_key text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT (c->>'score')::numeric
  FROM jsonb_array_elements(COALESCE(p_criteria, '[]'::jsonb)) c
  WHERE c->>'key' = p_key AND c->>'score' ~ '^-?[0-9.]+$'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.weakest_criterion(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.weakest_criterion(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.criterion_score(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criterion_score(jsonb, text) TO service_role;

-- ── The shared computation, one learner at a time ───────────────────────────
--
-- "Topic" for Grit/Feedback-responsiveness: Foundations pages (math/english/
-- science_skills) create a new dashboard row per session, so topic =
-- (activity_type, category_activity, sub_category) chains across rows.
-- Learning pages (ai_learning, ai_ready_skills, financial_literacy,
-- solar_engineering) and certifications reuse one row per module forever, so
-- topic = dashboard_id — each new evaluation_history snapshot on that same
-- row already *is* the next attempt.
--
-- Not SECURITY DEFINER itself: it must only ever be invoked from within
-- my_life_skill_metrics() or get_learner_growth(), both already SECURITY
-- DEFINER — a nested call inside a definer function's body keeps running as
-- that function's elevated role, the same way get_learner_growth() already
-- relies on for site_org_id(). See those two REVOKE/GRANT blocks below:
-- calling this directly is reserved for service_role only.
CREATE OR REPLACE FUNCTION public.life_skill_metrics_for(p_user_id uuid, p_since timestamptz DEFAULT '2026-11-25 00:00:00+00')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_low_score_count integer;
  v_retry_count     integer;
  v_tech_engaged    integer;
  v_tech_retried    integer;
  v_self_resolved   integer;
  v_total_sessions  integer;
  v_fb_total        integer;
  v_fb_improved     integer;
  v_messages_sent   integer;
  v_confirmed_flags integer;
  v_grit            numeric;
  v_independence    numeric;
  v_feedback_resp   numeric;
  v_community       numeric;
  v_components      integer := 0;
  v_total_rate      numeric := 0;
BEGIN
  WITH eval_topic AS (
    SELECT
      eh.id, eh.dashboard_id, eh.overall_score, eh.max_score, eh.criteria, eh.created_at,
      CASE WHEN eh.activity_type IN ('math_skills', 'english_skills', 'science_skills')
           THEN eh.activity_type || '|' || COALESCE(d.category_activity, '') || '|' || COALESCE(d.sub_category, '')
           ELSE eh.dashboard_id::text
      END AS topic_key
    FROM evaluation_history eh
    JOIN dashboard d ON d.id = eh.dashboard_id
    WHERE eh.user_id = p_user_id
  ),
  low_scores AS (
    SELECT * FROM eval_topic WHERE max_score > 0 AND overall_score IS NOT NULL AND overall_score / max_score < 0.66
  ),
  retries AS (
    SELECT ls.id FROM low_scores ls
    WHERE EXISTS (
      SELECT 1 FROM eval_topic later
      WHERE later.created_at > ls.created_at
        AND later.created_at <= ls.created_at + interval '30 days'
        AND (later.dashboard_id = ls.dashboard_id OR later.topic_key = ls.topic_key)
    )
  ),
  pairs AS (
    SELECT criteria, LAG(criteria) OVER (PARTITION BY topic_key ORDER BY created_at) AS prev_criteria
    FROM eval_topic
  ),
  responsiveness AS (
    SELECT
      (weakest_criterion(prev_criteria) ->> 'score')::numeric AS prev_score,
      criterion_score(criteria, weakest_criterion(prev_criteria) ->> 'key') AS later_score
    FROM pairs
    WHERE prev_criteria IS NOT NULL AND jsonb_array_length(prev_criteria) > 0
  ),
  tech AS (
    SELECT
      COUNT(*) FILTER (WHERE status <> 'not_started') AS engaged,
      COUNT(*) FILTER (WHERE status <> 'not_started' AND attempt_count > 1) AS retried
    FROM tech_skills_progress WHERE user_id = p_user_id
  ),
  sessions AS (
    SELECT
      COUNT(*) FILTER (WHERE hint_used_count = 0) AS self_resolved,
      COUNT(*) AS total
    FROM dashboard WHERE user_id = p_user_id AND created_at >= p_since
  )
  SELECT
    (SELECT COUNT(*) FROM low_scores),
    (SELECT COUNT(*) FROM retries),
    (SELECT engaged FROM tech),
    (SELECT retried FROM tech),
    (SELECT self_resolved FROM sessions),
    (SELECT total FROM sessions),
    (SELECT COUNT(*) FROM responsiveness),
    (SELECT COUNT(*) FILTER (WHERE later_score > prev_score) FROM responsiveness),
    (SELECT COUNT(*) FROM together_messages WHERE sender_id = p_user_id),
    (SELECT COUNT(*) FROM together_safety_flags WHERE sender_id = p_user_id AND disposition = 'confirmed')
  INTO v_low_score_count, v_retry_count, v_tech_engaged, v_tech_retried, v_self_resolved, v_total_sessions, v_fb_total, v_fb_improved, v_messages_sent, v_confirmed_flags;

  -- Grit: average of whichever of the two sources (Foundations/Learning
  -- retry rate, Tech Skills retry rate) this learner actually has data for.
  IF v_low_score_count > 0 THEN
    v_components := v_components + 1;
    v_total_rate := v_total_rate + (v_retry_count::numeric / v_low_score_count);
  END IF;
  IF v_tech_engaged > 0 THEN
    v_components := v_components + 1;
    v_total_rate := v_total_rate + (v_tech_retried::numeric / v_tech_engaged);
  END IF;
  IF v_components > 0 THEN v_grit := v_total_rate / v_components; END IF;

  v_independence := CASE WHEN v_total_sessions > 0 THEN v_self_resolved::numeric / v_total_sessions ELSE NULL END;
  v_feedback_resp := CASE WHEN v_fb_total > 0 THEN v_fb_improved::numeric / v_fb_total ELSE NULL END;
  v_community := 1 - (v_confirmed_flags::numeric / GREATEST(v_messages_sent, 1));

  RETURN jsonb_build_object(
    'grit', v_grit,
    'independence', v_independence,
    'feedback_responsiveness', v_feedback_resp,
    'uphold_community_standards', v_community,
    'sample_sizes', jsonb_build_object(
      'low_score_events', v_low_score_count,
      'tech_tasks_engaged', v_tech_engaged,
      'sessions_since_launch', v_total_sessions,
      'feedback_pairs', v_fb_total,
      'messages_sent', v_messages_sent
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.life_skill_metrics_for(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.life_skill_metrics_for(uuid, timestamptz) TO service_role;

-- ── Learner-facing: my own metrics ───────────────────────────────────────────
-- SECURITY DEFINER so a learner can read their own confirmed-flag count —
-- together_safety_flags' own RLS only allows leaders to read it, not even
-- the flagged learner themselves, which would otherwise make Community
-- Standards silently read as a perfect score for everyone.
CREATE OR REPLACE FUNCTION public.my_life_skill_metrics()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT life_skill_metrics_for(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.my_life_skill_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_life_skill_metrics() TO authenticated;

comment on function public.my_life_skill_metrics() is
  'Grit, Independence, Feedback-responsiveness and Uphold Community Standards for the calling learner. Each is 0-1 or null when there is not yet enough data. Nothing is backfilled.';
