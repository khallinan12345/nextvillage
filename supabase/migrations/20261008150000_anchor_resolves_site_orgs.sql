-- The anchor activity ("Prompt Improvement Challenge", set in anchor_config) is
-- stored once, under the main Davidson AI Futures Lab organization. Eight
-- learners are filed under duplicate/misspelled copies of that organization
-- (or none, with city Oloibiri), so they could not find it. Resolve the
-- activity for the whole site, as the headline statistics already do.
-- anchor_title itself was set separately in anchor_config.

CREATE OR REPLACE FUNCTION public.my_checkpoint_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  prof record;
  counts record;
  total integer;
  done integer[];
  window_n integer;
  revisit_min integer;
  anchor_title text;
  anchor_module uuid;
  lookup_org uuid;
  due integer;
  first_ai record;
  has_revisit boolean;
  open_attempt record;
  is_learner boolean;
BEGIN
  IF uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT role::text AS role, organization_id, city, membership_status::text AS membership_status
    INTO prof FROM profiles WHERE id = uid;
  is_learner := prof.role IN ('student', 'learner') AND prof.membership_status = 'approved';

  lookup_org := CASE
    WHEN prof.organization_id IN (
           'a1b2c3d4-0001-0001-0001-000000000001', '00bd2a68-7ae4-4e70-82de-455e865a9a48',
           '85f12740-d3bf-4f50-b36b-15dc4428bd08', '545d286d-2045-4792-92e5-f2fbec2e895e',
           '089cc033-e2c6-4227-b87f-9e27692c57d6')
      OR (prof.organization_id IS NULL AND prof.city ILIKE 'oloibiri%')
    THEN 'a1b2c3d4-0001-0001-0001-000000000001'::uuid
    ELSE prof.organization_id
  END;

  SELECT * INTO counts FROM learner_session_counts WHERE user_id = uid;
  total := COALESCE(counts.total_sessions, 0);

  SELECT COALESCE(array_agg(checkpoint), '{}') INTO done
    FROM anchor_attempts WHERE user_id = uid AND kind = 'checkpoint' AND completed_at IS NOT NULL;

  SELECT COALESCE(value::int, 5) INTO window_n FROM anchor_config WHERE key = 'baseline_window';
  SELECT COALESCE(value::int, 25) INTO revisit_min FROM anchor_config WHERE key = 'revisit_min_sessions';
  SELECT value INTO anchor_title FROM anchor_config WHERE key = 'anchor_title';

  IF anchor_title IS NOT NULL THEN
    SELECT m.learning_module_id INTO anchor_module
      FROM learning_modules m
      WHERE m.title = anchor_title AND m.public = 1
        AND (m.organization_id = lookup_org OR m.organization_id IS NULL)
      ORDER BY (m.organization_id = lookup_org) DESC NULLS LAST
      LIMIT 1;
  END IF;

  due := CASE WHEN is_learner AND anchor_module IS NOT NULL
              THEN anchor_due_checkpoint(total, done, COALESCE(window_n, 5)) END;

  SELECT d.id, d.activity, d.learning_module_id INTO first_ai
    FROM dashboard d
    WHERE d.user_id = uid AND d.category_activity = 'AI Learning'
      AND NOT dashboard_row_is_placeholder(d)
    ORDER BY COALESCE(first_message_at(d.chat_history::text), d.created_at)
    LIMIT 1;

  SELECT EXISTS (SELECT 1 FROM anchor_attempts WHERE user_id = uid AND kind = 'revisit') INTO has_revisit;

  SELECT a.id, a.kind, a.checkpoint INTO open_attempt
    FROM anchor_attempts a
    WHERE a.user_id = uid AND a.completed_at IS NULL
    ORDER BY a.started_at LIMIT 1;

  RETURN jsonb_build_object(
    'total_sessions', total,
    'by_area', jsonb_build_object(
      'learning', COALESCE(counts.learning, 0),
      'foundational', COALESCE(counts.foundational, 0),
      'tech_skills', COALESCE(counts.tech_skills, 0),
      'community_impact', COALESCE(counts.community_impact, 0),
      'ai_playground', COALESCE(counts.ai_playground, 0)
    ),
    'eligible_learner', is_learner,
    'due_checkpoint', due,
    'anchor_module_id', anchor_module,
    'open_attempt', CASE WHEN open_attempt.id IS NULL THEN NULL
                         ELSE jsonb_build_object('id', open_attempt.id, 'kind', open_attempt.kind,
                                                 'checkpoint', open_attempt.checkpoint) END,
    'revisit', jsonb_build_object(
      'eligible', is_learner AND total > COALESCE(revisit_min, 25)
                  AND first_ai.id IS NOT NULL AND NOT has_revisit,
      'source_dashboard_id', first_ai.id,
      'source_title', first_ai.activity,
      'learning_module_id', first_ai.learning_module_id
    )
  );
END;
$$;
