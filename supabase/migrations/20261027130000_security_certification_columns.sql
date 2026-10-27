-- Storage for the Security & Safety Certification (/certifications/security-safety).
--
-- Same shape as the other certification pages (fs_cert_* for Full-Stack): the learner's submitted copy of the
-- practice repo and the server's grading result, on their own dashboard row for the activity
-- 'Security & Safety Certification' (category_activity 'Certification').
--
--   sec_cert_session_id  text   — fixed key ('security-cert')
--   sec_cert_pages       jsonb  — the files as last submitted for grading
--   sec_cert_evaluation  jsonb  — per-criterion scores, overall average, passed, and passedAt (kept once earned)
--
-- The grading result is written by /api/security-certification with the service role. Existing dashboard row-level
-- security and table grants already cover the new columns; nothing is added to who can read or write.

ALTER TABLE public.dashboard
  ADD COLUMN IF NOT EXISTS sec_cert_session_id text,
  ADD COLUMN IF NOT EXISTS sec_cert_pages      jsonb,
  ADD COLUMN IF NOT EXISTS sec_cert_evaluation jsonb;
