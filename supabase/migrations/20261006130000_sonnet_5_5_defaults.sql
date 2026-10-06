-- Move live model settings from Claude Sonnet 5 to Claude Sonnet 5.5.
--
-- Only settings that choose a model going forward are changed:
--   * together_rooms.model default, and the rooms still pinned to the old ID.
-- Historical records (ai_playground_chats.model, api_cost_log.model,
-- user_monthly_assessments.assessment_model) say which model actually
-- produced past results, so they are deliberately left as they are.

ALTER TABLE public.together_rooms
  ALTER COLUMN model SET DEFAULT 'claude-sonnet-5-5'::text;

UPDATE public.together_rooms
  SET model = 'claude-sonnet-5-5'
  WHERE model = 'claude-sonnet-5';

-- A profile can store a preferred playground model; none carried the old ID
-- at the time of writing, but keep the rule so a stale value cannot linger.
UPDATE public.profiles
  SET ai_playground_model = 'claude-sonnet-5-5'
  WHERE ai_playground_model = 'claude-sonnet-5';
