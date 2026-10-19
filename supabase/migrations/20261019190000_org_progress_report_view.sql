-- The monthly progress report for an organization, readable in the app by the people who lead its learners.
--
-- get_org_progress_report(month, org) returns one object: the organization's name, the month, and for each
-- approved student/learner in it their four scores for that month and the month before, plus sessions.
-- Scores only: nothing the learner wrote, no AI comments about them, no certification counts.
--
-- Who can call it (Kevin, 19 Oct 2026): approved site leaders, teachers and facilitators, each for their OWN
-- organization only (the Oloibiri records count as one site), and platform administrators for any organization
-- they name. Anyone else, and anyone not yet approved, gets an error.

CREATE OR REPLACE FUNCTION public.get_org_progress_report(p_month date DEFAULT NULL, p_org uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me     record;
  org    uuid;
  m      date;
  result jsonb;
BEGIN
  SELECT role::text AS role, membership_status, organization_id, city INTO me FROM profiles WHERE id = auth.uid();
  IF me.role IS NULL OR me.membership_status IS DISTINCT FROM 'approved'
     OR me.role NOT IN ('platform_administrator', 'site_leader', 'teacher', 'facilitator') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF me.role = 'platform_administrator' THEN
    org := site_org_id(p_org, NULL);
    IF org IS NULL THEN RAISE EXCEPTION 'choose an organization'; END IF;
  ELSE
    org := site_org_id(me.organization_id, me.city);   -- the caller's own organization; p_org is ignored
    IF org IS NULL THEN RAISE EXCEPTION 'you are not in an organization'; END IF;
  END IF;

  m := coalesce(date_trunc('month', p_month)::date, (date_trunc('month', now()) - interval '1 month')::date);

  WITH learners AS (
    SELECT p.id, p.name
      FROM profiles p
     WHERE p.role::text IN ('student', 'learner') AND p.membership_status = 'approved'
       AND site_org_id(p.organization_id, p.city) = org
  ), cur AS (
    SELECT DISTINCT ON (a.user_id) a.user_id,
           jsonb_build_object('cognitive', a.cognitive_score, 'critical_thinking', a.critical_thinking_score,
                              'problem_solving', a.problem_solving_score, 'creativity', a.creativity_score,
                              'sessions', a.session_count) AS j
      FROM user_monthly_assessments a JOIN learners l ON l.id::text = a.user_id::text
     WHERE a.measured_at >= m AND a.measured_at < (m + interval '1 month')
     ORDER BY a.user_id, a.measured_at DESC
  ), prev AS (
    SELECT DISTINCT ON (a.user_id) a.user_id,
           jsonb_build_object('cognitive', a.cognitive_score, 'critical_thinking', a.critical_thinking_score,
                              'problem_solving', a.problem_solving_score, 'creativity', a.creativity_score,
                              'sessions', a.session_count) AS j
      FROM user_monthly_assessments a JOIN learners l ON l.id::text = a.user_id::text
     WHERE a.measured_at >= (m - interval '1 month') AND a.measured_at < m
     ORDER BY a.user_id, a.measured_at DESC
  )
  SELECT jsonb_build_object(
           'org', (SELECT o.name FROM organizations o WHERE o.id = org),
           'month', m,
           'learners', coalesce(jsonb_agg(jsonb_build_object('name', l.name, 'current', c.j, 'previous', pv.j) ORDER BY l.name), '[]'::jsonb))
    INTO result
    FROM learners l
    LEFT JOIN cur  c  ON c.user_id::text  = l.id::text
    LEFT JOIN prev pv ON pv.user_id::text = l.id::text;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_org_progress_report(date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_org_progress_report(date, uuid) TO authenticated;
