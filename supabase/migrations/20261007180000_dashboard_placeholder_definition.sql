-- A dashboard row should exist only because a learner actually started
-- something. This migration:
--   1. defines exactly what a pre-seeded placeholder row is,
--   2. makes the session view count every non-placeholder row as a session
--      (some tech-skills rows hold real work but keep progress = 'not started'),
--   3. switches off the function that pre-created placeholder rows.
--
-- A placeholder is a row that is 'not started', has no chat, and has no
-- content in any column except identity/catalog fields. team_activity is
-- excluded because it defaults to 'no' on every row.

CREATE OR REPLACE FUNCTION public.dashboard_row_is_placeholder(r public.dashboard)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT r.progress = 'not started'
     AND (r.chat_history IS NULL OR r.chat_history::text IN ('', '[]', 'null', '{}', '""'))
     AND NOT EXISTS (
       SELECT 1
       FROM jsonb_each(to_jsonb(r) - ARRAY[
         'id', 'user_id', 'title', 'activity', 'category_activity', 'sub_category',
         'progress', 'learning_module_id', 'grade_level', 'continent', 'country',
         'created_at', 'updated_at', 'chat_history', 'team_activity'
       ]) e
       WHERE e.value NOT IN ('null'::jsonb, '""'::jsonb, '[]'::jsonb, '{}'::jsonb)
     );
$$;

REVOKE ALL ON FUNCTION public.dashboard_row_is_placeholder(public.dashboard) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_row_is_placeholder(public.dashboard) TO service_role;

-- Same columns as before; only the dashboard filter changes.
CREATE OR REPLACE VIEW public.learner_sessions AS
  SELECT d.user_id,
         d.created_at AS started_at,
         COALESCE(m.area, 'unmapped') AS area,
         'dashboard'::text AS source
  FROM public.dashboard d
  LEFT JOIN public.session_area_map m ON m.category_activity = d.category_activity
  WHERE NOT public.dashboard_row_is_placeholder(d)
  UNION ALL
  SELECT c.user_id,
         c.created_at,
         'ai_playground'::text,
         'playground'::text
  FROM public.ai_playground_chats c
  WHERE jsonb_typeof(c.messages) = 'array' AND jsonb_array_length(c.messages) > 0;

-- The app no longer calls this (it created a 'not started' row for every
-- grade-appropriate module). Keep the signature so any old browser tab that
-- still calls it gets a harmless 0 instead of an error. It also used to bump
-- updated_at on every existing row each time it ran.
CREATE OR REPLACE FUNCTION public.create_grade_appropriate_dashboard_activities_by_continent(
  user_id_param uuid,
  continent_param text
)
RETURNS integer
LANGUAGE sql
AS $$
  SELECT 0;
$$;
