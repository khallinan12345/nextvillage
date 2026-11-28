-- Auto-save for the Pathways Explorer pilot (/pathways). A learner mid-conversation
-- who refreshes the page, or closes the tab, should come back to exactly where they
-- left off — one row per learner holding their current transcript, upserted after
-- every turn. This is current state, not a history (like pathway_shortlist), so a
-- new conversation simply overwrites the old one; there is no "start a new session"
-- concept yet in Phase 1.

CREATE TABLE IF NOT EXISTS public.journey_sessions (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.journey_sessions IS 'One row per learner: their in-progress Pathways Explorer conversation, auto-saved after every turn so a refresh resumes instead of starting over.';

ALTER TABLE public.journey_sessions ENABLE ROW LEVEL SECURITY;

-- anon/authenticated get automatic grants on new tables, so revoke per role first.
REVOKE ALL ON public.journey_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.journey_sessions TO authenticated;
GRANT ALL ON public.journey_sessions TO service_role;

DROP POLICY IF EXISTS own_journey_session ON public.journey_sessions;
CREATE POLICY own_journey_session ON public.journey_sessions FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Save (upsert) the caller's current transcript.
CREATE OR REPLACE FUNCTION public.save_journey_session(p_transcript jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  INSERT INTO journey_sessions (user_id, transcript, updated_at)
  VALUES (auth.uid(), p_transcript, now())
  ON CONFLICT (user_id) DO UPDATE SET transcript = p_transcript, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.save_journey_session(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_journey_session(jsonb) TO authenticated;

-- The caller's saved transcript, or an empty array if they have none yet.
CREATE OR REPLACE FUNCTION public.my_journey_session()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT transcript FROM journey_sessions WHERE user_id = auth.uid()),
    '[]'::jsonb
  );
$$;
REVOKE ALL ON FUNCTION public.my_journey_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_journey_session() TO authenticated;
