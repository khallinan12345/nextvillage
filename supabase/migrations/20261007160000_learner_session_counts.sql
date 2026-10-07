-- Per-learner session counts: total, and within each of five areas
-- (learning, foundational, tech_skills, community_impact, ai_playground).
--
-- What counts as a session: a dashboard row where the learner actually did
-- something (progress is 'started' or 'completed', or it holds a chat), plus
-- AI Playground chats (their own table) that contain messages.
--
-- Not every dashboard row is a session. The platform pre-creates rows for
-- activities a learner has not opened ('not started', no chat), sometimes
-- hundreds in one day. api/assess-monthly.ts counts all of them, which
-- overstates sessions several-fold; that is why this view does not reuse it.
--
-- Which area a dashboard row belongs to is decided by session_area_map, a
-- small lookup keyed on dashboard.category_activity, so it can be corrected
-- with an UPDATE and no code change. Categories not in the map count toward
-- the total and show as 'unmapped', so a new category never silently
-- vanishes. Rows marked needs_review were judgment calls.
--
-- Nothing here is readable by anon/authenticated except my_session_counts()
-- (own row) and get_session_mix_by_stage() (aggregates, 3+ learners per cell).

CREATE TABLE IF NOT EXISTS public.session_area_map (
  category_activity text PRIMARY KEY,
  area text NOT NULL CHECK (area IN ('learning', 'foundational', 'tech_skills', 'community_impact')),
  needs_review boolean NOT NULL DEFAULT false
);

ALTER TABLE public.session_area_map ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.session_area_map FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.session_area_map TO service_role;

INSERT INTO public.session_area_map (category_activity, area, needs_review) VALUES
  -- Learning: AI proficiency, digital literacy, core "AI Ready Skills" curriculum
  ('AI Proficiency', 'learning', false),
  ('AI Learning', 'learning', false),
  ('Digital Fluency', 'learning', false),
  ('Critical Thinking', 'learning', false),
  ('Problem Solving', 'learning', false),
  ('Communications', 'learning', false),
  ('Skills', 'learning', false),
  ('Skills Development', 'learning', false),
  ('Certification', 'learning', true),
  -- Technical & creative skills
  ('Tech Workshop', 'tech_skills', false),
  ('Vibe Coding', 'tech_skills', false),
  ('Coding', 'tech_skills', false),
  ('Image Generation', 'tech_skills', false),
  ('Video Generation', 'tech_skills', false),
  ('Voice Generation', 'tech_skills', false),
  ('Applied Creativity', 'tech_skills', true),
  ('Collaborative Project', 'tech_skills', true),
  -- Community impact
  ('Community Impact', 'community_impact', false),
  ('Financial Literacy', 'community_impact', true),
  -- Foundational: English, mathematics, science
  ('Oral Expression', 'foundational', true),
  ('Tutor', 'foundational', false),
  ('Counting & Number Sense', 'foundational', false),
  ('Listening & Response', 'foundational', false),
  ('Observation & Questioning', 'foundational', false),
  ('AI-Enhanced Writing', 'foundational', false),
  ('Written Communication', 'foundational', false),
  ('Reading Fluency', 'foundational', false),
  ('Addition & Subtraction', 'foundational', false),
  ('Multiplication & Division', 'foundational', false),
  ('Algebra & Geometry', 'foundational', false),
  ('Ratios, Rates & Proportions', 'foundational', false),
  ('Fractions & Decimals', 'foundational', false),
  ('Measurement & Geometry', 'foundational', false),
  ('Scientific Communication', 'foundational', false),
  ('Hypothesis & Prediction', 'foundational', false),
  ('Matter & Its Properties', 'foundational', false),
  ('Data, Patterns & Analysis', 'foundational', false),
  ('Cells & Life Processes', 'foundational', false),
  ('Investigation & Evidence', 'foundational', false)
ON CONFLICT (category_activity) DO NOTHING;

-- Every session, in one place, with the area it belongs to.
CREATE OR REPLACE VIEW public.learner_sessions AS
  SELECT d.user_id,
         d.created_at AS started_at,
         COALESCE(m.area, 'unmapped') AS area,
         'dashboard'::text AS source
  FROM public.dashboard d
  LEFT JOIN public.session_area_map m ON m.category_activity = d.category_activity
  WHERE d.progress IN ('started', 'completed')
     OR (d.chat_history IS NOT NULL AND d.chat_history::text NOT IN ('[]', 'null', '{}', '""'))
  UNION ALL
  SELECT c.user_id,
         c.created_at,
         'ai_playground'::text,
         'playground'::text
  FROM public.ai_playground_chats c
  WHERE jsonb_typeof(c.messages) = 'array' AND jsonb_array_length(c.messages) > 0;

CREATE OR REPLACE VIEW public.learner_session_counts AS
  SELECT user_id,
         COUNT(*)::int AS total_sessions,
         COUNT(*) FILTER (WHERE area = 'learning')::int AS learning,
         COUNT(*) FILTER (WHERE area = 'foundational')::int AS foundational,
         COUNT(*) FILTER (WHERE area = 'tech_skills')::int AS tech_skills,
         COUNT(*) FILTER (WHERE area = 'community_impact')::int AS community_impact,
         COUNT(*) FILTER (WHERE area = 'ai_playground')::int AS ai_playground,
         COUNT(*) FILTER (WHERE area = 'unmapped')::int AS unmapped,
         MIN(started_at) AS first_session_at,
         MAX(started_at) AS last_session_at
  FROM public.learner_sessions
  GROUP BY user_id;

-- Views here are auto-granted to anon/authenticated: lock both down, service role only.
REVOKE ALL ON public.learner_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.learner_session_counts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.learner_sessions TO service_role;
GRANT SELECT ON public.learner_session_counts TO service_role;

-- A signed-in learner can read their own counts (drives milestone prompts).
CREATE OR REPLACE FUNCTION public.my_session_counts()
RETURNS SETOF public.learner_session_counts
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.learner_session_counts WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.my_session_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_session_counts() TO authenticated, service_role;

-- How the mix of areas shifts as learners accumulate sessions: for each stage
-- of a learner's journey (by their nth session overall), the share of sessions
-- in each area. A move from Learning toward Tech Skills and the Playground is
-- a growth signal. Staff excluded; stages with fewer than 3 learners hidden.
CREATE OR REPLACE FUNCTION public.get_session_mix_by_stage()
RETURNS TABLE (
  stage text,
  learners integer,
  sessions integer,
  pct_learning numeric,
  pct_foundational numeric,
  pct_tech_skills numeric,
  pct_community_impact numeric,
  pct_ai_playground numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH enrolled AS (
    SELECT id FROM profiles
    WHERE role IN ('student', 'learner') AND membership_status = 'approved'
      AND (organization_id IN (
             'a1b2c3d4-0001-0001-0001-000000000001', '00bd2a68-7ae4-4e70-82de-455e865a9a48',
             '85f12740-d3bf-4f50-b36b-15dc4428bd08', '545d286d-2045-4792-92e5-f2fbec2e895e',
             '089cc033-e2c6-4227-b87f-9e27692c57d6')
           OR (organization_id IS NULL AND city ILIKE 'oloibiri%'))
  ),
  numbered AS (
    SELECT s.user_id, s.area,
           ROW_NUMBER() OVER (PARTITION BY s.user_id ORDER BY s.started_at) AS n
    FROM learner_sessions s
    WHERE s.user_id IN (SELECT id FROM enrolled)
  ),
  staged AS (
    SELECT user_id, area,
           CASE WHEN n <= 25 THEN '1-25'
                WHEN n <= 50 THEN '26-50'
                WHEN n <= 100 THEN '51-100'
                ELSE '101+' END AS stage
    FROM numbered
  )
  SELECT stage,
         COUNT(DISTINCT user_id)::int,
         COUNT(*)::int,
         ROUND(100.0 * COUNT(*) FILTER (WHERE area = 'learning') / COUNT(*), 1),
         ROUND(100.0 * COUNT(*) FILTER (WHERE area = 'foundational') / COUNT(*), 1),
         ROUND(100.0 * COUNT(*) FILTER (WHERE area = 'tech_skills') / COUNT(*), 1),
         ROUND(100.0 * COUNT(*) FILTER (WHERE area = 'community_impact') / COUNT(*), 1),
         ROUND(100.0 * COUNT(*) FILTER (WHERE area = 'ai_playground') / COUNT(*), 1)
  FROM staged
  GROUP BY stage
  HAVING COUNT(DISTINCT user_id) >= 3
  ORDER BY MIN(CASE stage WHEN '1-25' THEN 1 WHEN '26-50' THEN 2 WHEN '51-100' THEN 3 ELSE 4 END);
$$;

REVOKE ALL ON FUNCTION public.get_session_mix_by_stage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_mix_by_stage() TO anon, authenticated, service_role;
