-- Monthly numbers for the board report ("Impact Mining Program News", api/board-monthly-report.ts).
-- One call returns everything for one calendar month as JSON. Counts only: no learner names or
-- anything a learner wrote. Admin / facilitator accounts (Kevin, Bennywhite) are left out of
-- learner counts, but AI cost counts everything because the platform pays for all of it.
--
-- Definitions (so the numbers can be explained):
--   new students    profiles with role 'student' created in the month, grouped by organization,
--                   African organizations only (organizations.continent = 'Africa')
--   certifications  distinct learner + certification pairs whose first 'completed' Certification
--                   row was last updated in the month. The dashboard holds duplicate rows for the
--                   same learner and certification, so raw row counts overstate passes.
--   new orgs        organizations created in the month
--   sessions        rows of learner_sessions that started in the month (same definition as the
--                   landing page and cohort charts)
--   AI cost         sum of api_cost_log.estimated_cost_usd in the month, by provider

CREATE OR REPLACE FUNCTION public.get_board_monthly_stats(p_month_start date)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT p_month_start::timestamptz AS s, (p_month_start + interval '1 month')::timestamptz AS e
  ),
  excluded(id) AS (
    VALUES ('0e738663-a70e-4fd3-9ba6-718c02e116c2'::uuid), ('8b3f70dc-e5d0-4eb0-af7d-ec6181968213'),
           ('5d5e0486-e768-4c5d-ba63-d1e4570a352d'), ('40e9daa6-7ec1-49a9-9be7-814a3d607d86'),
           ('73da14c1-e49a-4410-9390-6fe069fd7528'), ('f6157a9d-5ffd-4058-b0b3-af3ea897d876')
  ),
  students AS (
    SELECT p.id, p.organization_id, p.created_at FROM profiles p
    WHERE p.role = 'student' AND p.merged_into IS NULL AND p.id NOT IN (SELECT id FROM excluded)
  ),
  first_cert AS (
    SELECT d.user_id, COALESCE(d.title, d.activity) AS title, min(d.updated_at) AS first_done
    FROM dashboard d
    WHERE d.category_activity = 'Certification' AND d.progress = 'completed'
      AND d.user_id NOT IN (SELECT id FROM excluded)
    GROUP BY d.user_id, COALESCE(d.title, d.activity)
  )
  SELECT jsonb_build_object(
    'month_start', p_month_start,
    'new_students_by_org', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', o.name, 'country', o.country,
               'new_students', (SELECT count(*) FROM students s, bounds b
                                WHERE s.organization_id = o.id AND s.created_at >= b.s AND s.created_at < b.e),
               'total_students', (SELECT count(*) FROM students s WHERE s.organization_id = o.id))
             ORDER BY o.name)
      FROM organizations o WHERE o.continent = 'Africa'), '[]'::jsonb),
    'new_certifications', (SELECT count(*) FROM first_cert c, bounds b WHERE c.first_done >= b.s AND c.first_done < b.e),
    'certifications_by_title', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('title', t.title, 'count', t.n) ORDER BY t.n DESC, t.title)
      FROM (SELECT c.title, count(*) AS n FROM first_cert c, bounds b
            WHERE c.first_done >= b.s AND c.first_done < b.e GROUP BY c.title) t), '[]'::jsonb),
    'total_certifications', (SELECT count(*) FROM first_cert),
    'new_organizations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', o.name, 'country', o.country, 'continent', o.continent) ORDER BY o.created_at)
      FROM organizations o, bounds b WHERE o.created_at >= b.s AND o.created_at < b.e), '[]'::jsonb),
    'total_organizations', (SELECT count(*) FROM organizations),
    'sessions', (SELECT count(*) FROM learner_sessions ls, bounds b
                 WHERE ls.started_at >= b.s AND ls.started_at < b.e AND ls.user_id NOT IN (SELECT id FROM excluded)),
    'active_learners', (SELECT count(DISTINCT ls.user_id) FROM learner_sessions ls, bounds b
                 WHERE ls.started_at >= b.s AND ls.started_at < b.e AND ls.user_id NOT IN (SELECT id FROM excluded)),
    'ai_cost_total_usd', (SELECT COALESCE(round(sum(a.estimated_cost_usd), 2), 0) FROM api_cost_log a, bounds b
                 WHERE a.logged_at >= b.s AND a.logged_at < b.e),
    'ai_requests', (SELECT count(*) FROM api_cost_log a, bounds b WHERE a.logged_at >= b.s AND a.logged_at < b.e),
    'ai_cost_by_provider', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('provider', t.provider, 'usd', t.usd, 'requests', t.n) ORDER BY t.usd DESC, t.provider)
      FROM (SELECT a.provider, round(sum(a.estimated_cost_usd), 2) AS usd, count(*) AS n FROM api_cost_log a, bounds b
            WHERE a.logged_at >= b.s AND a.logged_at < b.e GROUP BY a.provider) t), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.get_board_monthly_stats(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_board_monthly_stats(date) TO service_role;
