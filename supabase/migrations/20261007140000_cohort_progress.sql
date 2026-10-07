-- Cohort lines: the same learners followed over time, grouped by the month of
-- their first session (or first started activity, whichever is earlier).
--
-- Tier is certification-based: how many formal certifications a learner has
-- passed by the end of each month. (dashboard.grade_level is the level of the
-- module a learner picks, not what they have shown, and is already at its
-- maximum for almost everyone in their first month.)
--
-- Staff and non-learner roles are excluded. Cells for cohorts with fewer than
-- 3 learners return NULL metrics so individuals cannot be picked out.
-- Aggregates only.

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
  act AS (
    SELECT d.user_id, d.created_at, d.updated_at, d.certificate_pdf_url IS NOT NULL AS is_cert
    FROM dashboard d WHERE d.user_id IN (SELECT id FROM enrolled)
  ),
  sess AS (  -- latest assessment with sessions in each learner-month
    SELECT DISTINCT ON (u.user_id, date_trunc('month', u.measured_at))
           u.user_id, date_trunc('month', u.measured_at)::date AS m,
           u.session_count, u.scaffold_clarification_per_session AS clarif
    FROM user_monthly_assessments u
    WHERE u.session_count > 0 AND u.user_id IN (SELECT id FROM enrolled)
    ORDER BY u.user_id, date_trunc('month', u.measured_at), u.measured_at DESC
  ),
  firsts AS (
    SELECT user_id, date_trunc('month', MIN(t))::date AS cohort_month FROM (
      SELECT user_id, created_at AS t FROM act
      UNION ALL SELECT user_id, m::timestamptz FROM sess
    ) x GROUP BY user_id
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
      EXISTS (SELECT 1 FROM sess s WHERE s.user_id = g.user_id AND s.m = g.m)
        OR EXISTS (SELECT 1 FROM act a WHERE a.user_id = g.user_id
                   AND date_trunc('month', a.created_at)::date = g.m) AS active,
      (SELECT COUNT(*) FROM act a WHERE a.user_id = g.user_id AND a.is_cert
         AND date_trunc('month', a.updated_at)::date <= g.m) AS certs_so_far,
      (SELECT s.session_count FROM sess s WHERE s.user_id = g.user_id AND s.m = g.m) AS sessions,
      (SELECT s.clarif FROM sess s WHERE s.user_id = g.user_id AND s.m = g.m) AS clarif
    FROM grid g
  )
  SELECT c.cohort_month,
         c.month_index,
         COUNT(*)::int,
         CASE WHEN COUNT(*) >= 3 THEN (COUNT(*) FILTER (WHERE c.active))::int END,
         CASE WHEN COUNT(*) >= 3 THEN (COUNT(*) FILTER (WHERE c.certs_so_far > 0))::int END,
         CASE WHEN COUNT(*) >= 3 THEN ROUND(AVG(c.certs_so_far), 2) END,
         CASE WHEN COUNT(*) >= 3 THEN ROUND(AVG(c.sessions) FILTER (WHERE c.active), 1) END,
         CASE WHEN COUNT(*) >= 3 THEN ROUND(AVG(c.clarif), 2) END
  FROM cell c
  GROUP BY c.cohort_month, c.month_index
  ORDER BY c.cohort_month, c.month_index;
$$;

-- anon/authenticated are auto-granted on new functions here: revoke per role,
-- then grant back explicitly (the public landing page calls this).
REVOKE ALL ON FUNCTION public.get_cohort_progress() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cohort_progress() TO anon, authenticated, service_role;
