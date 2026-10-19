-- One row per organization per month once its progress report has been emailed to its leaders
-- (api/org-monthly-report.ts). Recipients live in report_recipients with
--   report = 'org_progress:<organization id>'
-- and are added with a plain INSERT, for example:
--   insert into report_recipients (report, email, name)
--   values ('org_progress:a1b2c3d4-0001-0001-0001-000000000001', 'someone@example.org', 'Someone');
-- and removed with: update report_recipients set active = false where email = '...';
--
-- Server only: RLS on, no policy, and no grant to signed-in users or visitors (revoked per role
-- because new tables are granted to anon and authenticated by default).

CREATE TABLE IF NOT EXISTS public.org_progress_report_runs (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  month date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  recipients integer NOT NULL,
  learner_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, month)
);

ALTER TABLE public.org_progress_report_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.org_progress_report_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.org_progress_report_runs TO service_role;
