-- Real AI-administered evaluation for the Tech Skills employability roadmap
-- (/tech-skills). A previous attempt at this (see git history: 2115a69,
-- 7e88ded) wired up submission + AI evaluation directly from the client,
-- writing into the pre-existing `tech_skills_progress` table. It broke
-- because the client parsed the /api/chat proxy response using the raw
-- Anthropic shape (data.content[0].text) while the proxy actually returns an
-- OpenAI-style shape (data.choices[0].message.content) — so every submission
-- silently evaluated against an empty {} and was marked needs_work. Rather
-- than fix that forward, it was reverted to a self-checked local-only stub
-- (6dc31aa) — the integrity gap this migration + a new edge function fix.
--
-- It also left `tech_skills_progress` grant anon/authenticated INSERT and
-- UPDATE with RLS only checking user_id = auth.uid() — meaning a learner
-- could write status='pass' directly from devtools without ever being
-- evaluated. This migration removes those grants; all writes now go through
-- the evaluate-tech-skills-submission edge function using the service role.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS mentor_name text,
  ADD COLUMN IF NOT EXISTS mentor_repo_url text;

REVOKE INSERT, UPDATE, DELETE ON tech_skills_progress FROM authenticated, anon;

CREATE VIEW tech_skills_progress_admin AS
SELECT
  s.user_id, p.organization_id, p.name AS learner_name,
  s.phase_id, s.track_label, s.task_name, s.status, s.ai_score,
  s.attempt_count, s.submitted_at, s.evaluated_at
FROM tech_skills_progress s
LEFT JOIN profiles p ON p.id = s.user_id;
