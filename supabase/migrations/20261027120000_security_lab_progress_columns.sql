-- Progress storage for the Security & Safety Lab (/tech-skills/security-safety).
--
-- Mirrors how the other tech-skill activities keep a learner's work on their own dashboard row
-- (fs_* for Full-Stack, gh300_* for GH-300): four nullable columns, one row per learner per activity
-- ('security_safety_lab'). Existing dashboard row-level security and table grants already cover the
-- new columns; nothing is added to who can read or write.
--
--   sec_session_id    text   — fixed key ('security-lab'); one lab per learner
--   sec_session_name  text   — display name
--   sec_pages         jsonb  — the learner's edited copy of the practice repo's files
--   sec_progress      jsonb  — which steps are done, with tries and whether the answer was shown

ALTER TABLE public.dashboard
  ADD COLUMN IF NOT EXISTS sec_session_id   text,
  ADD COLUMN IF NOT EXISTS sec_session_name text,
  ADD COLUMN IF NOT EXISTS sec_pages        jsonb,
  ADD COLUMN IF NOT EXISTS sec_progress     jsonb;
