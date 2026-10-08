-- Per-learner change view for facilitators and researchers.
--
-- get_learner_growth() returns one object per enrolled learner (approved
-- student/learner roles, staff excluded) showing how things changed from their
-- start to now:
--   * real sessions, in total and by area, plus the mix of areas in their first
--     25 sessions against their most recent 25 (once they have 50 or more)
--   * the first and latest monthly assessment (skill scores and clarification
--     requests per session), counting only months with real sessions
--   * formal certifications earned
--   * Prompt Challenge results when they exist: the original first session
--     against the redo, and the score at each checkpoint (mean of the four scores)
--
-- Only platform administrators and research leads (all learners) and site
-- leaders and leaders (learners in their own organization, with the duplicate
-- Oloibiri organization records counted as one site) can call it;
-- anyone else gets an error. Names are shown because these roles can already see
-- learners by name in the admin pages.

CREATE OR REPLACE FUNCTION public.site_org_id(p_org uuid, p_city text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_org IN (
           'a1b2c3d4-0001-0001-0001-000000000001', '00bd2a68-7ae4-4e70-82de-455e865a9a48',
           '85f12740-d3bf-4f50-b36b-15dc4428bd08', '545d286d-2045-4792-92e5-f2fbec2e895e',
           '089cc033-e2c6-4227-b87f-9e27692c57d6')
      OR (p_org IS NULL AND p_city ILIKE 'oloibiri%')
    THEN 'a1b2c3d4-0001-0001-0001-000000000001'::uuid
    ELSE p_org
  END;
$$;
REVOKE ALL ON FUNCTION public.site_org_id(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_org_id(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_learner_growth()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me record;
  result jsonb;
BEGIN
  SELECT role::text AS role, organization_id, city INTO me FROM profiles WHERE id = auth.uid();
  IF me.role IS NULL OR me.role NOT IN ('platform_administrator', 'research_lead', 'site_leader', 'leader') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  WITH enrolled AS (
    SELECT p.id, p.name, site_org_id(p.organization_id, p.city) AS org
    FROM profiles p
    WHERE p.role IN ('student', 'learner') AND p.membership_status = 'approved'
  ),
  scoped AS (
    SELECT * FROM enrolled e
    WHERE me.role IN ('platform_administrator', 'research_lead')
       OR e.org IS NOT DISTINCT FROM site_org_id(me.organization_id, me.city)
  ),
  sess AS (
    SELECT s.user_id, s.area, s.started_at,
           ROW_NUMBER() OVER (PARTITION BY s.user_id ORDER BY s.started_at) AS rn,
           COUNT(*) OVER (PARTITION BY s.user_id) AS n
    FROM learner_sessions s
    WHERE s.user_id IN (SELECT id FROM scoped)
  ),
  asm AS (  -- one assessment per learner-month (the latest), months with real sessions only
    SELECT x.*,
           ROW_NUMBER() OVER (PARTITION BY x.user_id ORDER BY x.measured_at) AS rn_first,
           ROW_NUMBER() OVER (PARTITION BY x.user_id ORDER BY x.measured_at DESC) AS rn_last
    FROM (
      SELECT DISTINCT ON (u.user_id, date_trunc('month', u.measured_at))
             u.user_id, u.measured_at,
             NULLIF(u.cognitive_score, 0) AS cog,
             NULLIF(u.critical_thinking_score, 0) AS crit,
             NULLIF(u.problem_solving_score, 0) AS prob,
             NULLIF(u.creativity_score, 0) AS creat,
             NULLIF(u.scaffold_clarification_per_session, 0) AS clar
      FROM user_monthly_assessments u
      WHERE u.session_count > 0 AND u.user_id IN (SELECT id FROM scoped)
      ORDER BY u.user_id, date_trunc('month', u.measured_at), u.measured_at DESC
    ) x
  )
  SELECT COALESCE(jsonb_agg(t.obj ORDER BY (t.obj ->> 'total_sessions')::int DESC, t.obj ->> 'name'), '[]'::jsonb)
  INTO result
  FROM (
    SELECT jsonb_build_object(
      'learner_id', e.id,
      'name', e.name,
      'organization', (SELECT o.name FROM organizations o WHERE o.id = e.org),
      'first_session_at', (SELECT MIN(s.started_at) FROM sess s WHERE s.user_id = e.id),
      'total_sessions', COALESCE((SELECT MAX(s.n) FROM sess s WHERE s.user_id = e.id), 0),
      'by_area', COALESCE((SELECT jsonb_object_agg(a.area, a.c)
                           FROM (SELECT s.area, COUNT(*) AS c FROM sess s WHERE s.user_id = e.id GROUP BY s.area) a), '{}'::jsonb),
      'early_mix', COALESCE((SELECT jsonb_object_agg(a.area, a.c)
                             FROM (SELECT s.area, COUNT(*) AS c FROM sess s
                                   WHERE s.user_id = e.id AND s.rn <= 25 GROUP BY s.area) a), '{}'::jsonb),
      'recent_mix', (SELECT jsonb_object_agg(a.area, a.c)
                     FROM (SELECT s.area, COUNT(*) AS c FROM sess s
                           WHERE s.user_id = e.id AND s.n >= 50 AND s.rn > s.n - 25 GROUP BY s.area) a),
      'assessed_months', (SELECT COUNT(*) FROM asm a WHERE a.user_id = e.id),
      'first_assessment', (SELECT jsonb_build_object('month', date_trunc('month', a.measured_at)::date,
                             'cognitive', a.cog, 'critical_thinking', a.crit, 'problem_solving', a.prob,
                             'creativity', a.creat, 'clarifications', a.clar)
                           FROM asm a WHERE a.user_id = e.id AND a.rn_first = 1),
      'latest_assessment', (SELECT jsonb_build_object('month', date_trunc('month', a.measured_at)::date,
                              'cognitive', a.cog, 'critical_thinking', a.crit, 'problem_solving', a.prob,
                              'creativity', a.creat, 'clarifications', a.clar)
                            FROM asm a WHERE a.user_id = e.id AND a.rn_last = 1),
      'certifications', (SELECT COUNT(*) FROM dashboard d WHERE d.user_id = e.id AND d.certificate_pdf_url IS NOT NULL),
      'revisit', (SELECT jsonb_build_object(
                    'original', (SELECT jsonb_build_object('cognitive', s.cognitive_score, 'critical_thinking', s.critical_thinking_score,
                                   'problem_solving', s.problem_solving_score, 'creativity', s.creativity_score)
                                 FROM anchor_scores s WHERE s.attempt_id = r.id AND s.subject = 'original'),
                    'new', (SELECT jsonb_build_object('cognitive', s.cognitive_score, 'critical_thinking', s.critical_thinking_score,
                              'problem_solving', s.problem_solving_score, 'creativity', s.creativity_score)
                            FROM anchor_scores s WHERE s.attempt_id = r.id AND s.subject = 'attempt'))
                  FROM anchor_attempts r
                  WHERE r.user_id = e.id AND r.kind = 'revisit' AND r.completed_at IS NOT NULL LIMIT 1),
      'checkpoints', (SELECT jsonb_object_agg(c.checkpoint::text, c.score)
                      FROM (SELECT a.checkpoint,
                                   ROUND((SELECT AVG(v) FROM unnest(ARRAY[s.cognitive_score, s.critical_thinking_score,
                                            s.problem_solving_score, s.creativity_score]) v), 1) AS score
                            FROM anchor_attempts a
                            JOIN anchor_scores s ON s.attempt_id = a.id AND s.subject = 'attempt'
                            WHERE a.user_id = e.id AND a.kind = 'checkpoint' AND a.completed_at IS NOT NULL) c
                      WHERE c.score IS NOT NULL)
    ) AS obj
    FROM scoped e
  ) t;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_learner_growth() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_learner_growth() TO authenticated, service_role;
