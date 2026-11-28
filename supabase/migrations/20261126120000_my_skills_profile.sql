-- my_skills_profile(): the learner's CURRENT (not longitudinal) level in the
-- four Skills Development rubric dimensions that double as general life
-- skills — Critical Thinking, Problem-Solving, Creativity, Communication
-- (RUBRIC_DEFINITIONS in AIReadySkillsPage.tsx). Distinct from
-- my_life_skill_metrics() (20261125150000_life_skill_metrics.sql), which is
-- behavioral/longitudinal (did you retry, did you act on feedback); this is
-- simply "what's your latest measured score in each", reusing evaluations
-- data that's already there — no new instrumentation.
--
-- A learner can have several dashboard rows under the same sub_category
-- (one per Skills Development scenario they've tried in that area), each
-- with its own evaluation, so "current" means the most recently updated one
-- per dimension, not any one fixed row.

CREATE OR REPLACE FUNCTION public.my_skills_profile()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_object_agg(x.sub_category, x.pct), '{}'::jsonb)
  FROM (
    SELECT
      d.sub_category,
      (e.overall_score / e.max_score) AS pct,
      ROW_NUMBER() OVER (PARTITION BY d.sub_category ORDER BY e.updated_at DESC) AS rn
    FROM evaluations e
    JOIN dashboard d ON d.id = e.dashboard_id
    WHERE e.user_id = auth.uid()
      AND e.activity_type = 'ai_ready_skills'
      AND d.sub_category IN ('Critical Thinking', 'Problem-Solving', 'Creativity', 'Communication')
      AND e.overall_score IS NOT NULL AND e.max_score > 0
  ) x
  WHERE x.rn = 1;
$$;

REVOKE ALL ON FUNCTION public.my_skills_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_skills_profile() TO authenticated;

comment on function public.my_skills_profile() is
  'Learner''s latest measured score (0-1) per Skills Development dimension: Critical Thinking, Problem-Solving, Creativity, Communication. Keys present only where the learner has at least one evaluation in that dimension.';
