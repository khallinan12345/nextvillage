-- UD-OLLI guardrail lab: two AI agents (Anchor = guarded, Driftwood =
-- unguarded) that UD-OLLI students use to analyze news and watch what
-- guardrails change, plus a comparison agent that contrasts the two.
--
-- Who can see any of this: approved members of the UD-OLLI organization,
-- that organization's leader, and platform administrators. Pending or
-- declined members are outside the org (get_my_effective_profile reports no
-- organization for them), so they get nothing.
--
-- Who can write: only the server (api/udolli.js, service role). Students get
-- read-only access to their own rows, so an analysis cannot be forged or
-- edited from the browser console.
--
-- The organization row itself is data, not schema: it was created directly
-- (join codes are private and are deliberately not committed to git).

-- ── 1. Access helpers ─────────────────────────────────────────────────────
-- UD-OLLI organization id (fixed so the app and the database agree).

CREATE OR REPLACE FUNCTION public.udolli_has_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM get_my_effective_profile() me
      WHERE me.organization_id = 'a1b2c3d4-0002-0002-0002-00000000d011'::uuid
         OR me.role = 'platform_administrator'
    )
    OR EXISTS (
      SELECT 1 FROM organizations o
      WHERE o.id = 'a1b2c3d4-0002-0002-0002-00000000d011'::uuid
        AND o.leader_id = auth.uid()
    );
$$;

-- Instructors (see every student's analyses): the org's leader, an approved
-- leader/site leader of the org, or a platform administrator.
CREATE OR REPLACE FUNCTION public.udolli_is_instructor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM get_my_effective_profile() me
      WHERE me.role = 'platform_administrator'
         OR (me.organization_id = 'a1b2c3d4-0002-0002-0002-00000000d011'::uuid
             AND me.role IN ('site_leader', 'leader'))
    )
    OR EXISTS (
      SELECT 1 FROM organizations o
      WHERE o.id = 'a1b2c3d4-0002-0002-0002-00000000d011'::uuid
        AND o.leader_id = auth.uid()
    );
$$;

-- Functions used inside RLS policies run as the querying user, so signed-in
-- users need EXECUTE. anon gets nothing.
REVOKE ALL ON FUNCTION public.udolli_has_access()   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.udolli_is_instructor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.udolli_has_access()   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.udolli_is_instructor() TO authenticated, service_role;

-- ── 2. Tables ─────────────────────────────────────────────────────────────

-- A session is one sitting: the chat history sidebar lists these.
CREATE TABLE IF NOT EXISTS public.udolli_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title      text NOT NULL DEFAULT 'New session',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS udolli_sessions_user_idx ON public.udolli_sessions (user_id, updated_at DESC);

-- One row per agent response. This is the record of "what the student asked"
-- and "what the agent produced"; each agent's chat history is these rows in
-- order. round_id ties together the two agents' answers to the same message.
CREATE TABLE IF NOT EXISTS public.udolli_analyses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES public.udolli_sessions(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  round_id     uuid NOT NULL,
  agent        text NOT NULL CHECK (agent IN ('anchor', 'driftwood')),
  prompt       text NOT NULL,
  source_title text,
  source_text  text,
  result       text NOT NULL,
  outbox       jsonb NOT NULL DEFAULT '[]'::jsonb,
  signals      jsonb NOT NULL DEFAULT '{}'::jsonb,
  model        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS udolli_analyses_session_idx ON public.udolli_analyses (session_id, created_at);
CREATE INDEX IF NOT EXISTS udolli_analyses_user_idx    ON public.udolli_analyses (user_id, created_at DESC);

-- The comparison agent's write-ups (one per click of the Compare button).
CREATE TABLE IF NOT EXISTS public.udolli_comparisons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES public.udolli_sessions(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  result      jsonb NOT NULL,
  round_count integer NOT NULL DEFAULT 0,
  model       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS udolli_comparisons_session_idx ON public.udolli_comparisons (session_id, created_at DESC);

-- ── 3. Row-level security: read-only for people, writes via the server ────

ALTER TABLE public.udolli_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.udolli_analyses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.udolli_comparisons ENABLE ROW LEVEL SECURITY;

CREATE POLICY udolli_sessions_read ON public.udolli_sessions
  FOR SELECT TO authenticated
  USING (public.udolli_has_access() AND (user_id = auth.uid() OR public.udolli_is_instructor()));

CREATE POLICY udolli_analyses_read ON public.udolli_analyses
  FOR SELECT TO authenticated
  USING (public.udolli_has_access() AND (user_id = auth.uid() OR public.udolli_is_instructor()));

CREATE POLICY udolli_comparisons_read ON public.udolli_comparisons
  FOR SELECT TO authenticated
  USING (public.udolli_has_access() AND (user_id = auth.uid() OR public.udolli_is_instructor()));

-- ── 4. Grants ─────────────────────────────────────────────────────────────
-- Supabase auto-grants new tables to anon/authenticated, so revoke per role
-- explicitly. People get SELECT only; the service role does all writing.

REVOKE ALL ON public.udolli_sessions, public.udolli_analyses, public.udolli_comparisons
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.udolli_sessions, public.udolli_analyses, public.udolli_comparisons
  TO authenticated;
GRANT ALL ON public.udolli_sessions, public.udolli_analyses, public.udolli_comparisons
  TO service_role;
