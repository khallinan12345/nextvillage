-- Storage for the monthly learner-effort ("seriousness") report.
--
--   report_recipients          who receives which report (editable without a code change)
--   seriousness_reviews        one effort rating per learner per month, with the counts it was based on
--   seriousness_report_runs    one row per month once the email has been sent
--
-- All three are for the server only: no policy and no grant to signed-in users
-- or visitors. Recipient addresses are added with a plain INSERT, not in this file:
--   insert into report_recipients (report, email, name)
--   values ('seriousness_report', 'someone@example.org', 'Someone');
-- and removed with: update report_recipients set active = false where email = '...';

CREATE TABLE IF NOT EXISTS public.report_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report text NOT NULL,
  email text NOT NULL,
  name text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report, email)
);

CREATE TABLE IF NOT EXISTS public.seriousness_reviews (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month date NOT NULL,
  rating text NOT NULL CHECK (rating IN ('serious', 'mixed', 'not_serious', 'insufficient')),
  reason text,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, month)
);

CREATE TABLE IF NOT EXISTS public.seriousness_report_runs (
  month date PRIMARY KEY,
  sent_at timestamptz NOT NULL DEFAULT now(),
  recipients integer NOT NULL,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.report_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seriousness_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seriousness_report_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.report_recipients FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.seriousness_reviews FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.seriousness_report_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.report_recipients TO service_role;
GRANT ALL ON TABLE public.seriousness_reviews TO service_role;
GRANT ALL ON TABLE public.seriousness_report_runs TO service_role;
