-- The Prompt Challenge runs on its own page, not through a dashboard activity,
-- so a standardized facilitator is used at every checkpoint and a revisit
-- starts from a clean conversation. Two changes follow:
--   1. save_anchor_transcript(): keep the conversation as the learner goes, so
--      an unfinished attempt can be resumed.
--   2. finish_anchor_attempt(): the dashboard row is now optional.
-- Both only touch the signed-in learner's own unfinished attempt.

CREATE OR REPLACE FUNCTION public.save_anchor_transcript(p_attempt uuid, p_transcript jsonb)
RETURNS void
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
  IF jsonb_typeof(p_transcript) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'transcript must be a list of messages';
  END IF;
  UPDATE anchor_attempts
     SET transcript = p_transcript
   WHERE id = p_attempt AND user_id = uid AND completed_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'attempt not found or already finished';
  END IF;
END;
$$;

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
  IF p_dashboard IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM dashboard WHERE id = p_dashboard AND user_id = uid) THEN
    RAISE EXCEPTION 'dashboard row does not belong to this learner';
  END IF;
  IF jsonb_typeof(p_transcript) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'transcript must be a list of messages';
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

REVOKE ALL ON FUNCTION public.save_anchor_transcript(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_anchor_transcript(uuid, jsonb) TO authenticated, service_role;
