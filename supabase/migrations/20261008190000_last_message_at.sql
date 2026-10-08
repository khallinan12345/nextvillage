-- When a chat session ended: the timestamp of its last message.
--
-- dashboard.updated_at cannot be used for this on older rows: the function that
-- pre-created activity rows also refreshed updated_at on every existing row each
-- time it ran (it has been switched off), so it often holds a refresh time
-- rather than a completion time. Companion to first_message_at().

CREATE OR REPLACE FUNCTION public.last_message_at(chat text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  ts text;
BEGIN
  IF chat IS NULL OR left(chat, 1) <> '[' THEN
    RETURN NULL;
  END IF;
  ts := (chat::jsonb -> -1) ->> 'timestamp';
  IF ts IS NULL OR ts !~ '^\d{4}-\d{2}-\d{2}' THEN
    RETURN NULL;
  END IF;
  RETURN ts::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.last_message_at(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.last_message_at(text) TO service_role;
