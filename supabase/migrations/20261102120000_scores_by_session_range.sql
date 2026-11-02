-- "When learners stick, they grow": average monthly skill scores of enrolled learners who have
-- reached 100 sessions, grouped by how many sessions they had done when each score was recorded.
--
-- Rules: staff excluded (same enrolled definition as get_cohort_progress); usage-only months and
-- all-zero scoring failures excluded; repeat scorings in one learner-month averaged first so no
-- learner counts twice in a month; each learner then counts once per session range (the average
-- of their own months in it); a session range with fewer than 5 learners returns NULL scores so
-- no individual can be picked out. Aggregates only.

CREATE OR REPLACE FUNCTION public.get_scores_by_session_range()
RETURNS TABLE (
  range_order integer,
  range_label text,
  learners integer,
  learner_months integer,
  cognitive numeric,
  critical_thinking numeric,
  problem_solving numeric,
  creativity numeric,
  overall numeric
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
  sticky AS (
    SELECT c.user_id FROM learner_session_counts c
    WHERE c.total_sessions >= 100 AND c.user_id IN (SELECT id FROM enrolled)
  ),
  scored AS (
    SELECT u.user_id, date_trunc('month', u.measured_at) AS mo,
           u.cognitive_score AS cog, u.critical_thinking_score AS ct,
           u.problem_solving_score AS ps, u.creativity_score AS cr,
           (SELECT count(*) FROM learner_sessions s
             WHERE s.user_id = u.user_id AND s.started_at <= u.measured_at) AS sess
    FROM user_monthly_assessments u
    WHERE u.user_id IN (SELECT user_id FROM sticky)
      AND coalesce(u.assessment_version, '') <> 'usage-v1'
      AND u.cognitive_score IS NOT NULL AND u.critical_thinking_score IS NOT NULL
      AND u.problem_solving_score IS NOT NULL AND u.creativity_score IS NOT NULL
      AND NOT (u.cognitive_score = 0 AND u.critical_thinking_score = 0
               AND u.problem_solving_score = 0 AND u.creativity_score = 0
               AND coalesce(u.pue_score, 0) = 0)
  ),
  lm AS (
    SELECT user_id, mo, avg(sess) AS sess, avg(cog) AS cog, avg(ct) AS ct, avg(ps) AS ps, avg(cr) AS cr
    FROM scored GROUP BY user_id, mo
  ),
  b AS (
    SELECT *, CASE WHEN sess < 25 THEN 1 WHEN sess < 50 THEN 2 WHEN sess < 100 THEN 3
                   WHEN sess < 200 THEN 4 ELSE 5 END AS bin
    FROM lm
  ),
  pl AS (  -- one value per learner per range, so a learner with many scored months does not outweigh the rest
    SELECT bin, user_id, count(*) AS n_months,
           avg(cog) AS cog, avg(ct) AS ct, avg(ps) AS ps, avg(cr) AS cr
    FROM b GROUP BY bin, user_id
  ),
  agg AS (
    SELECT bin, count(*)::int AS n_learners, sum(n_months)::int AS n_months,
           avg(cog) AS cog, avg(ct) AS ct, avg(ps) AS ps, avg(cr) AS cr,
           avg((cog + ct + ps + cr) / 4) AS overall
    FROM pl GROUP BY bin
  )
  SELECT r.o, r.l,
         coalesce(a.n_learners, 0), coalesce(a.n_months, 0),
         CASE WHEN a.n_learners >= 5 THEN round(a.cog, 1) END,
         CASE WHEN a.n_learners >= 5 THEN round(a.ct, 1) END,
         CASE WHEN a.n_learners >= 5 THEN round(a.ps, 1) END,
         CASE WHEN a.n_learners >= 5 THEN round(a.cr, 1) END,
         CASE WHEN a.n_learners >= 5 THEN round(a.overall, 1) END
  FROM (VALUES (1, '0-24'), (2, '25-49'), (3, '50-99'), (4, '100-199'), (5, '200+')) AS r(o, l)
  LEFT JOIN agg a ON a.bin = r.o
  ORDER BY r.o;
$$;

-- Per-role revokes: Supabase default privileges grant these roles on every new function.
REVOKE ALL ON FUNCTION public.get_scores_by_session_range() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_scores_by_session_range() TO anon, authenticated, service_role;
