-- A small request counter for public API routes (the ones anyone can call without signing in), so a single
-- caller cannot, for example, trigger sign-in emails to someone else's inbox again and again.
--
-- rate_limit_hit(key, max, window_seconds) counts one request against `key` in the current fixed window and
-- returns true while the count is within `max`. The API route builds the key; for callers it is an HMAC of the
-- network address, never the address itself, and rows are deleted after two days (daily cleanup below).
-- Only the server (service role) can call it; the table is not readable by app users.

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key          text        NOT NULL,
  window_start timestamptz NOT NULL,
  hits         integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
-- Supabase auto-grants new tables to anon/authenticated; revoke explicitly. No policies: service role only.
REVOKE ALL ON public.api_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  w timestamptz;
  n integer;
BEGIN
  IF p_key IS NULL OR length(p_key) = 0 OR p_max < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'rate_limit_hit: bad arguments';
  END IF;

  w := to_timestamp(floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds);

  INSERT INTO public.api_rate_limits AS r (key, window_start, hits)
  VALUES (p_key, w, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET hits = r.hits + 1
  RETURNING r.hits INTO n;

  RETURN n <= p_max;
END;
$$;

-- Server only: closed to every app role, then opened to the service role alone.
REVOKE ALL ON FUNCTION public.rate_limit_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, integer, integer) TO service_role;

-- Daily cleanup (pg_cron is present on Supabase; skipped where it is not, such as local test databases).
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule('purge-api-rate-limits')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-api-rate-limits');
    PERFORM cron.schedule(
      'purge-api-rate-limits',
      '17 3 * * *',
      $cron$ DELETE FROM public.api_rate_limits WHERE window_start < now() - interval '2 days' $cron$
    );
  END IF;
END
$do$;
