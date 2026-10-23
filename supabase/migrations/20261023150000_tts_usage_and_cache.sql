-- Text-to-speech cost control.
--   * tts_usage: one row per voice request (who, how many characters, whether it came from the cache), so the
--     server can cap a person's daily spend and we can see what voice costs. Written only by the server.
--   * tts-cache: private storage bucket holding each generated clip under a hash of its text, so identical
--     text is only ever paid for once.
--   * my_voice_days(): how many different days the signed-in learner has used voice. The app fades voice out
--     as that number grows (full voice at first, then tap-to-play, then off by default).

CREATE TABLE IF NOT EXISTS public.tts_usage (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chars      integer NOT NULL CHECK (chars >= 0),
  provider   text NOT NULL,
  cache_hit  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tts_usage_user_time_idx ON public.tts_usage (user_id, created_at DESC);

ALTER TABLE public.tts_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tts_usage FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.tts_usage_id_seq FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tts_usage TO service_role;
GRANT ALL ON SEQUENCE public.tts_usage_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.my_voice_days()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT count(DISTINCT (created_at AT TIME ZONE 'UTC')::date)::integer FROM tts_usage WHERE user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.my_voice_days() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_voice_days() TO authenticated, service_role;

-- No policies on purpose: only the server (service role) reads or writes the bucket.
INSERT INTO storage.buckets (id, name, public) VALUES ('tts-cache', 'tts-cache', false)
ON CONFLICT (id) DO NOTHING;
