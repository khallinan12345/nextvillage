-- Anchor-task attempts and the live checkpoint status.
--
-- Two kinds of attempt, both scored later on the same four-score rubric
-- (cognitive, critical thinking, problem solving, creativity; 0-100):
--   checkpoint  the same prompt-engineering activity at 0, 25, 50 and 100
--               real sessions, counted across all five areas
--   revisit     a learner already past revisit_min_sessions re-does their own
--               first AI Learning session, so the old and new transcripts can
--               be scored blind with the same rubric
--
-- Learners cannot insert or edit attempts directly: the database decides
-- whether an attempt is due and records the session count at the time, so the
-- research data cannot be skewed by the client. Scores live in a separate
-- table the learner cannot read or write.

-- Settings. anchor_title is deliberately not set yet: it names the one
-- activity (resolved to each organization's own copy by title) used at every
-- checkpoint. Until it is set, no checkpoint is offered.
CREATE TABLE IF NOT EXISTS public.anchor_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.anchor_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.anchor_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.anchor_config TO service_role;
INSERT INTO public.anchor_config (key, value) VALUES
  ('revisit_min_sessions', '25'),
  ('baseline_window', '5')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.anchor_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('checkpoint', 'revisit')),
  checkpoint integer CHECK (checkpoint IN (0, 25, 50, 100)),
  learning_module_id uuid,
  dashboard_id uuid REFERENCES public.dashboard(id) ON DELETE SET NULL,
  source_dashboard_id uuid REFERENCES public.dashboard(id) ON DELETE SET NULL,
  sessions_at_start integer NOT NULL CHECK (sessions_at_start >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  transcript jsonb,
  original_transcript jsonb,
  CONSTRAINT anchor_kind_matches_checkpoint CHECK (
    (kind = 'checkpoint' AND checkpoint IS NOT NULL) OR (kind = 'revisit' AND checkpoint IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS anchor_attempts_one_checkpoint
  ON public.anchor_attempts (user_id, checkpoint) WHERE kind = 'checkpoint';
CREATE UNIQUE INDEX IF NOT EXISTS anchor_attempts_one_revisit
  ON public.anchor_attempts (user_id) WHERE kind = 'revisit';

ALTER TABLE public.anchor_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.anchor_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.anchor_attempts TO authenticated;
GRANT ALL ON TABLE public.anchor_attempts TO service_role;
DROP POLICY IF EXISTS "anchor_attempts: own read" ON public.anchor_attempts;
CREATE POLICY "anchor_attempts: own read" ON public.anchor_attempts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.anchor_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.anchor_attempts(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (subject IN ('attempt', 'original')),
  cognitive_score numeric(5,2) CHECK (cognitive_score BETWEEN 0 AND 100),
  critical_thinking_score numeric(5,2) CHECK (critical_thinking_score BETWEEN 0 AND 100),
  problem_solving_score numeric(5,2) CHECK (problem_solving_score BETWEEN 0 AND 100),
  creativity_score numeric(5,2) CHECK (creativity_score BETWEEN 0 AND 100),
  evidence jsonb,
  scorer_model text NOT NULL,
  scored_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, subject)
);
ALTER TABLE public.anchor_scores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.anchor_scores FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.anchor_scores TO service_role;

-- Which checkpoint is due, given total real sessions and checkpoints already
-- completed. The highest reached checkpoint is offered (a learner who jumps
-- from 20 to 60 sessions is offered 50, not 25 then 50), the baseline (0) is
-- only offered to learners still at the start, and a lower checkpoint is never
-- offered after a higher one is done.
CREATE OR REPLACE FUNCTION public.anchor_due_checkpoint(
  p_total integer, p_done integer[], p_baseline_window integer DEFAULT 5
) RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT v.c
  FROM (VALUES (0), (25), (50), (100)) v(c)
  WHERE p_total >= v.c
    AND NOT (v.c = ANY (COALESCE(p_done, '{}')))
    AND v.c > COALESCE((SELECT MAX(x) FROM unnest(p_done) x), -1)
    AND NOT (v.c = 0 AND p_total > p_baseline_window)
  ORDER BY v.c DESC
  LIMIT 1;
$$;

-- Live status for the signed-in learner: real session counts (total and by
-- area), whether a checkpoint or the revisit is due, and any attempt in
-- progress. Staff and unapproved accounts are never prompted.
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
  due integer;
  first_ai record;
  has_revisit boolean;
  open_attempt record;
  is_learner boolean;
BEGIN
  IF uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT role::text AS role, organization_id, membership_status::text AS membership_status
    INTO prof FROM profiles WHERE id = uid;
  is_learner := prof.role IN ('student', 'learner') AND prof.membership_status = 'approved';

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
        AND (m.organization_id = prof.organization_id OR m.organization_id IS NULL)
      ORDER BY (m.organization_id = prof.organization_id) DESC NULLS LAST
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

-- Begin (or resume) an attempt. The database checks it is due and records the
-- learner's real session count at this moment.
CREATE OR REPLACE FUNCTION public.start_anchor_attempt(p_kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  st jsonb;
  existing record;
  src record;
  new_id uuid;
  module_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  IF p_kind NOT IN ('checkpoint', 'revisit') THEN
    RAISE EXCEPTION 'unknown attempt kind: %', p_kind;
  END IF;

  st := my_checkpoint_status();
  IF NOT (st ->> 'eligible_learner')::boolean THEN
    RAISE EXCEPTION 'only approved learners can start an anchor attempt';
  END IF;

  -- Resume an unfinished attempt of the same kind instead of creating another.
  SELECT * INTO existing FROM anchor_attempts
    WHERE user_id = uid AND kind = p_kind AND completed_at IS NULL
    ORDER BY started_at LIMIT 1;
  IF existing.id IS NOT NULL THEN
    RETURN to_jsonb(existing) - 'transcript' - 'original_transcript';
  END IF;

  IF p_kind = 'checkpoint' THEN
    IF (st ->> 'due_checkpoint') IS NULL THEN
      RAISE EXCEPTION 'no checkpoint is due';
    END IF;
    INSERT INTO anchor_attempts (user_id, kind, checkpoint, learning_module_id, sessions_at_start)
    VALUES (uid, 'checkpoint', (st ->> 'due_checkpoint')::int,
            (st ->> 'anchor_module_id')::uuid, (st ->> 'total_sessions')::int)
    RETURNING id INTO new_id;
  ELSE
    IF NOT (st -> 'revisit' ->> 'eligible')::boolean THEN
      RAISE EXCEPTION 'revisit is not available';
    END IF;
    SELECT d.id, d.learning_module_id, d.chat_history INTO src
      FROM dashboard d WHERE d.id = (st -> 'revisit' ->> 'source_dashboard_id')::uuid AND d.user_id = uid;
    module_id := src.learning_module_id;
    INSERT INTO anchor_attempts (user_id, kind, learning_module_id, source_dashboard_id,
                                 sessions_at_start, original_transcript)
    VALUES (uid, 'revisit', module_id, src.id, (st ->> 'total_sessions')::int,
            CASE WHEN left(src.chat_history, 1) = '[' THEN src.chat_history::jsonb END)
    RETURNING id INTO new_id;
  END IF;

  RETURN (SELECT to_jsonb(a) - 'transcript' - 'original_transcript' FROM anchor_attempts a WHERE a.id = new_id);
END;
$$;

-- Finish an attempt: link the dashboard row the learner worked in and keep a
-- snapshot of the transcript so later scoring is stable.
CREATE OR REPLACE FUNCTION public.finish_anchor_attempt(
  p_attempt uuid, p_dashboard uuid, p_transcript jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  n integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM dashboard WHERE id = p_dashboard AND user_id = uid) THEN
    RAISE EXCEPTION 'dashboard row does not belong to this learner';
  END IF;
  UPDATE anchor_attempts
     SET dashboard_id = p_dashboard, transcript = p_transcript, completed_at = now()
   WHERE id = p_attempt AND user_id = uid AND completed_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'attempt not found or already finished';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.anchor_due_checkpoint(integer, integer[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anchor_due_checkpoint(integer, integer[], integer) TO service_role;
REVOKE ALL ON FUNCTION public.my_checkpoint_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_checkpoint_status() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_anchor_attempt(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_anchor_attempt(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.finish_anchor_attempt(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_anchor_attempt(uuid, uuid, jsonb) TO authenticated, service_role;
