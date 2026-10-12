-- 1) Make deleting a user possible.
--
-- Nine foreign keys to auth.users were NO ACTION, so deleting a user who appears in
-- any of those tables failed outright. After this, deleting an auth user removes (or
-- detaches) everything that points at them.
--   * rows that ARE the person's own data  -> ON DELETE CASCADE
--   * rows that merely record who reviewed/created something -> ON DELETE SET NULL
--     (the reviewed record stays; the reviewer's id is cleared)

ALTER TABLE public.weekly_champions
  DROP CONSTRAINT IF EXISTS weekly_champions_champion_user_id_fkey,
  ADD CONSTRAINT weekly_champions_champion_user_id_fkey
    FOREIGN KEY (champion_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.community_impact_tiers
  DROP CONSTRAINT IF EXISTS community_impact_tiers_referred_learner_id_fkey,
  ADD CONSTRAINT community_impact_tiers_referred_learner_id_fkey
    FOREIGN KEY (referred_learner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.challenge_enrollments
  DROP CONSTRAINT IF EXISTS challenge_enrollments_referral_enrollee_id_fkey,
  ADD CONSTRAINT challenge_enrollments_referral_enrollee_id_fkey
    FOREIGN KEY (referral_enrollee_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Reviewer / creator columns: must be nullable to be cleared.
ALTER TABLE public.research_badges           ALTER COLUMN verified_by   DROP NOT NULL;
ALTER TABLE public.researcher_phase_debriefs ALTER COLUMN reviewed_by   DROP NOT NULL;
ALTER TABLE public.researcher_portfolios     ALTER COLUMN reviewed_by   DROP NOT NULL;
ALTER TABLE public.research_task_progress    ALTER COLUMN validated_by  DROP NOT NULL;
ALTER TABLE public.research_programs         ALTER COLUMN submitted_by  DROP NOT NULL;
ALTER TABLE public.research_teams            ALTER COLUMN created_by    DROP NOT NULL;

ALTER TABLE public.research_badges
  DROP CONSTRAINT IF EXISTS research_badges_verified_by_fkey,
  ADD CONSTRAINT research_badges_verified_by_fkey
    FOREIGN KEY (verified_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.researcher_phase_debriefs
  DROP CONSTRAINT IF EXISTS researcher_phase_debriefs_reviewed_by_fkey,
  ADD CONSTRAINT researcher_phase_debriefs_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.researcher_portfolios
  DROP CONSTRAINT IF EXISTS researcher_portfolios_reviewed_by_fkey,
  ADD CONSTRAINT researcher_portfolios_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.research_task_progress
  DROP CONSTRAINT IF EXISTS research_task_progress_validated_by_fkey,
  ADD CONSTRAINT research_task_progress_validated_by_fkey
    FOREIGN KEY (validated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.research_programs
  DROP CONSTRAINT IF EXISTS research_programs_submitted_by_fkey,
  ADD CONSTRAINT research_programs_submitted_by_fkey
    FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.research_teams
  DROP CONSTRAINT IF EXISTS research_teams_created_by_fkey,
  ADD CONSTRAINT research_teams_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2) Retention for operational logs (the only data with a clear, non-controversial
--    purpose window). Learner content and assessment results are NOT touched here;
--    their schedule needs a decision from the partner communities (docs/DATA-MAP.md).
--
--    system_events: routine events 180 days; safeguarding events (safety_flag_*) 2 years.
--    api_cost_log:  keep the cost rows for finance, but after 13 months drop the link
--                   to a person (user_id, city).
--    code_execution_log: 30 days.

CREATE OR REPLACE FUNCTION public.purge_operational_logs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n_events bigint;
  n_safety bigint;
  n_cost   bigint;
  n_code   bigint;
BEGIN
  DELETE FROM system_events
   WHERE created_at < now() - interval '180 days'
     AND event_type NOT LIKE 'safety\_flag\_%';
  GET DIAGNOSTICS n_events = ROW_COUNT;

  DELETE FROM system_events
   WHERE created_at < now() - interval '2 years'
     AND event_type LIKE 'safety\_flag\_%';
  GET DIAGNOSTICS n_safety = ROW_COUNT;

  UPDATE api_cost_log
     SET user_id = NULL, city = NULL
   WHERE logged_at < now() - interval '13 months'
     AND (user_id IS NOT NULL OR city IS NOT NULL);
  GET DIAGNOSTICS n_cost = ROW_COUNT;

  DELETE FROM code_execution_log WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS n_code = ROW_COUNT;

  RETURN jsonb_build_object(
    'system_events_deleted', n_events,
    'safety_events_deleted', n_safety,
    'api_cost_rows_detached', n_cost,
    'code_runs_deleted', n_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_operational_logs() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'purge-operational-logs',
  '30 3 * * *',
  $$ SELECT public.purge_operational_logs(); $$
);
