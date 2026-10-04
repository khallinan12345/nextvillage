-- Per-user log of code runs, used by api/execute-code.ts to cap each person
-- at a few dozen runs per 10 minutes. Written and read only by the API
-- route (service role); nobody else can see or touch it.

CREATE TABLE IF NOT EXISTS public.code_execution_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  language   text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS code_execution_log_user_time_idx
  ON public.code_execution_log (user_id, created_at DESC);

ALTER TABLE public.code_execution_log ENABLE ROW LEVEL SECURITY;
-- Supabase auto-grants new tables to anon/authenticated; revoke explicitly.
REVOKE ALL ON public.code_execution_log FROM PUBLIC, anon, authenticated;
