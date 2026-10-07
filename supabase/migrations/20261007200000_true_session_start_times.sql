-- Use the real start time of a session, not the row's created_at.
--
-- Until October 2026 the app bulk-created a dashboard row for every module at
-- signup, so created_at is the signup date, not when the learner actually
-- began the activity. About a third of chat sessions began more than a week
-- after their row existed, and over a thousand fall in a different month.
-- Every chat message carries its own timestamp, so the first message's
-- timestamp is the true start. Rows without a chat (generation tools and
-- similar create their row on use) keep created_at.
--
-- Effects: learner_sessions.started_at is corrected, so session ordering
-- (nth session), first_session_at and the area mix by stage are right, and
-- get_cohort_progress() now assigns cohorts by true first session and counts
-- real sessions per month.

CREATE OR REPLACE FUNCTION public.first_message_at(chat text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  ts text;
BEGIN
  IF chat IS NULL OR left(chat, 1) <> '[' THEN
    RETURN NULL;
  END IF;
  ts := (chat::jsonb -> 0) ->> 'timestamp';
  IF ts IS NULL OR ts !~ '^\d{4}-\d{2}-\d{2}' THEN
    RETURN NULL;
  END IF;
  RETURN ts::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.first_message_at(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.first_message_at(text) TO service_role;

CREATE OR REPLACE VIEW public.learner_sessions AS
  SELECT d.user_id,
         COALESCE(public.first_message_at(d.chat_history::text), d.created_at) AS started_at,
         COALESCE(m.area, 'unmapped') AS area,
         'dashboard'::text AS source
  FROM public.dashboard d
  LEFT JOIN public.session_area_map m ON m.category_activity = d.category_activity
  WHERE NOT public.dashboard_row_is_placeholder(d)
  UNION ALL
  SELECT c.user_id,
         c.created_at,
         'ai_playground'::text,
         'playground'::text
  FROM public.ai_playground_chats c
  WHERE jsonb_typeof(c.messages) = 'array' AND jsonb_array_length(c.messages) > 0;

-- Cohorts by month of true first session; sessions per month are real counts.
CREATE OR REPLACE FUNCTION public.get_cohort_progress()
RETURNS TABLE (
  cohort_month date,
  month_index integer,
  cohort_size integer,
  active_learners integer,
  learners_certified integer,
  avg_certs numeric,
  avg_sessions numeric,
  avg_clarifications numeric
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
  ev AS (  -- one row per learner per month, with the real session count
    SELECT s.user_id, date_trunc('month', s.started_at)::date AS m, COUNT(*)::int AS n
    FROM learner_sessions s
    WHERE s.user_id IN (SELECT id FROM enrolled)
    GROUP BY 1, 2
  ),
  certs AS (
    SELECT d.user_id, d.updated_at
    FROM dashboard d
    WHERE d.certificate_pdf_url IS NOT NULL AND d.user_id IN (SELECT id FROM enrolled)
  ),
  clar AS (  -- latest monthly assessment with sessions, for clarifications/session
    SELECT DISTINCT ON (u.user_id, date_trunc('month', u.measured_at))
           u.user_id, date_trunc('month', u.measured_at)::date AS m,
           u.scaffold_clarification_per_session AS clarif
    FROM user_monthly_assessments u
    WHERE u.session_count > 0 AND u.user_id IN (SELECT id FROM enrolled)
    ORDER BY u.user_id, date_trunc('month', u.measured_at), u.measured_at DESC
  ),
  firsts AS (
    SELECT user_id, MIN(m) AS cohort_month FROM ev GROUP BY user_id
  ),
  grid AS (
    SELECT f.user_id, f.cohort_month, gs::date AS m,
           (EXTRACT(year FROM age(gs, f.cohort_month)) * 12
            + EXTRACT(month FROM age(gs, f.cohort_month)))::int AS month_index
    FROM firsts f
    CROSS JOIN LATERAL generate_series(f.cohort_month, date_trunc('month', now())::date, interval '1 month') gs
  ),
  cell AS (
    SELECT g.cohort_month, g.month_index, g.user_id,
      (SELECT e.n FROM ev e WHERE e.user_id = g.user_id AND e.m = g.m) AS sessions,
      (SELECT COUNT(*) FROM certs c WHERE c.user_id = g.user_id
         AND date_trunc('month', c.updated_at)::date <= g.m) AS certs_so_far,
      (SELECT c2.clarif FROM clar c2 WHERE c2.user_id = g.user_id AND c2.m = g.m) AS clarif
    FROM grid g
  )
  SELECT c.cohort_month,
         c.month_index,
         COUNT(*)::int,
         CASE WHEN COUNT(*) >= 3 THEN (COUNT(*) FILTER (WHERE c.sessions > 0))::int END,
         CASE WHEN COUNT(*) >= 3 THEN (COUNT(*) FILTER (WHERE c.certs_so_far > 0))::int END,
         CASE WHEN COUNT(*) >= 3 THEN ROUND(AVG(c.certs_so_far), 2) END,
         CASE WHEN COUNT(*) >= 3 THEN ROUND(AVG(c.sessions) FILTER (WHERE c.sessions > 0), 1) END,
         CASE WHEN COUNT(*) >= 3 THEN ROUND(AVG(c.clarif), 2) END
  FROM cell c
  GROUP BY c.cohort_month, c.month_index
  ORDER BY c.cohort_month, c.month_index;
$$;
