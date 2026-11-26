-- dashboard.hint_used_count
-- Third piece of the life-skill-metrics series. Independence (self-resolve
-- vs. hint-usage) has no persisted signal today — the only trace of a
-- learner clicking "Improve my explanation" is an ordinary assistant chat
-- message inside the free-text chat_history blob, which the 60/90-day
-- retention purge erases anyway. Rather than regex-matching fragile,
-- copy-dependent message text, add a tiny counter instead.
--
-- increment_hint_used() is called from each page's existing "Improve"
-- handler (no new UI — same button, it now also counts). Atomic
-- read-modify-write via SQL rather than a client-side read-then-update,
-- and auth.uid()-scoped so a learner can only bump their own row.

ALTER TABLE public.dashboard
  ADD COLUMN IF NOT EXISTS hint_used_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_hint_used(p_dashboard_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.dashboard
     SET hint_used_count = hint_used_count + 1
   WHERE id = p_dashboard_id AND user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.increment_hint_used(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_hint_used(uuid) TO authenticated;

comment on column public.dashboard.hint_used_count is
  'Times the learner used this session''s "Improve/hint" button. Bumped by increment_hint_used(). Rows created before this shipped are indistinguishable from rows where it was never used — see the Independence metric''s own filtering by created_at.';
