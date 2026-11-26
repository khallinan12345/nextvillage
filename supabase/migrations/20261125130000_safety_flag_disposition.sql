-- together_safety_flags.disposition
-- status is only 'open'/'reviewed' — it records that a leader looked at a
-- flag, not whether it was real. The auto-detector has known false
-- positives (e.g. ordinary dialogue tripping 'secrecy_or_meeting'), so
-- treating every "reviewed" flag as a confirmed violation would unfairly
-- conflate a dismissed false positive with a real safety issue — especially
-- relevant for a future "Uphold Community Standards" metric computed per
-- learner from this table.
--
-- Adds a disposition the leader sets when reviewing, and requires it going
-- forward (review_together_safety_flag now takes it as a required param —
-- the old single-arg overload is dropped, not left around as a second,
-- disposition-less way to review a flag).

ALTER TABLE public.together_safety_flags
  ADD COLUMN IF NOT EXISTS disposition text CHECK (disposition IN ('confirmed', 'dismissed'));

CREATE INDEX IF NOT EXISTS together_safety_flags_sender_disposition_idx
  ON public.together_safety_flags (sender_id, disposition, created_at);

DROP FUNCTION IF EXISTS public.review_together_safety_flag(uuid);

CREATE OR REPLACE FUNCTION public.review_together_safety_flag(p_flag_id uuid, p_disposition text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  flag_org uuid;
BEGIN
  IF p_disposition NOT IN ('confirmed', 'dismissed') THEN
    RAISE EXCEPTION 'p_disposition must be confirmed or dismissed';
  END IF;

  SELECT organization_id INTO flag_org FROM together_safety_flags WHERE id = p_flag_id;
  IF flag_org IS NULL OR NOT leads_organization(flag_org) THEN
    RAISE EXCEPTION 'Only a leader of this organization can review its safety flags';
  END IF;

  UPDATE together_safety_flags
     SET status = 'reviewed', disposition = p_disposition, reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = p_flag_id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_together_safety_flag(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_together_safety_flag(uuid, text) TO authenticated;

comment on column public.together_safety_flags.disposition is
  'Set by the reviewing leader: confirmed (a real violation) or dismissed (false positive). Null until reviewed. A per-learner "Uphold Community Standards" metric should count only confirmed flags.';
