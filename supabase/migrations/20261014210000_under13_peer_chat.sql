-- Under-13 tier, step 2: no peer chat for young learners.
--
-- Together rooms put several learners (and Claude) in one conversation. For learners who are
-- young (see is_young_learner(), migration 20261014200000) the rooms are switched off at the
-- database, so it holds even if someone calls the API directly. An organization can opt in
-- explicitly with organizations.allow_young_peer_chat (off by default).
--
-- REQUIRES migration 20261014200000_under13_hide_names to be applied first.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS allow_young_peer_chat boolean NOT NULL DEFAULT false;

-- Is the signed-in user blocked from peer chat? Only ever answers about the caller.
CREATE OR REPLACE FUNCTION public.viewer_peer_chat_blocked()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_young_learner(auth.uid())
     AND NOT coalesce((
       SELECT o.allow_young_peer_chat
         FROM profiles p
         JOIN organizations o ON o.id = coalesce(p.organization_id, org_id_for_join_code(p.join_code_used))
        WHERE p.id = auth.uid()
     ), false);
$$;
REVOKE ALL ON FUNCTION public.viewer_peer_chat_blocked() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.viewer_peer_chat_blocked() TO authenticated, service_role;

-- RESTRICTIVE policies are ANDed with the existing ones, so nothing else about who may
-- read or write rooms and messages changes.
DROP POLICY IF EXISTS no_peer_chat_for_young ON public.together_rooms;
CREATE POLICY no_peer_chat_for_young ON public.together_rooms
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT (SELECT public.viewer_peer_chat_blocked()));

DROP POLICY IF EXISTS no_peer_chat_for_young ON public.together_messages;
CREATE POLICY no_peer_chat_for_young ON public.together_messages
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT (SELECT public.viewer_peer_chat_blocked()));
