-- Restate historical session counts as real sessions.
-- Applied to production on 2026-10-07 at Kevin's request ("overwrite"); this
-- file is the repo record of that change.
--
-- user_monthly_assessments.session_count was set to "dashboard rows created
-- that month", which counted bulk-created placeholder rows (inflating many
-- months) and missed real sessions in rows created in an earlier month
-- (deflating others). It is now the number of real curriculum sessions that
-- began in that learner-month, by the true start time (see learner_sessions).
-- AI Playground chats stay in their own column, as before.
--
-- Originals are kept in session_count_raw on both tables, so the earlier
-- (published) values remain reproducible. dashboard_stats is rebuilt from
-- user_monthly_assessments by the snapshot function; its current rows are
-- updated here so public figures are corrected without waiting for a rebuild.
-- Snapshot learner tokens end with the first 24 hex characters of the user id,
-- which is how rows are matched back to learner-months.

ALTER TABLE public.user_monthly_assessments ADD COLUMN IF NOT EXISTS session_count_raw integer;
UPDATE public.user_monthly_assessments SET session_count_raw = session_count WHERE session_count_raw IS NULL;

ALTER TABLE public.dashboard_stats ADD COLUMN IF NOT EXISTS session_count_raw integer;
UPDATE public.dashboard_stats SET session_count_raw = session_count WHERE session_count_raw IS NULL;

UPDATE public.user_monthly_assessments u
SET session_count = (
  SELECT COUNT(*)
  FROM public.learner_sessions s
  WHERE s.user_id = u.user_id
    AND s.source = 'dashboard'
    AND date_trunc('month', s.started_at) = date_trunc('month', u.measured_at)
);

UPDATE public.dashboard_stats ds
SET session_count = m.session_count
FROM (
  SELECT DISTINCT ON (substr(replace(u.user_id::text, '-', ''), 1, 24), date_trunc('month', u.measured_at)::date)
         substr(replace(u.user_id::text, '-', ''), 1, 24) AS uid24,
         date_trunc('month', u.measured_at)::date AS mo,
         u.session_count
  FROM public.user_monthly_assessments u
  ORDER BY substr(replace(u.user_id::text, '-', ''), 1, 24), date_trunc('month', u.measured_at)::date, u.measured_at DESC
) m
WHERE substr(ds.learner_token, 9) = m.uid24
  AND ds.cohort_month = m.mo;
