-- Retention for learner content, per Kevin's decisions of 2026-10-14 (docs/DATA-MAP.md section 4).
--
-- This migration only CREATES the function and does NOT schedule it. It defaults to a dry run
-- that changes nothing and returns how many rows each rule would touch. Run for real only
-- after the counts have been reviewed:
--     SELECT public.purge_learner_content(false);
-- and schedule it separately (see the end of this file).
--
-- Rules (under-13 means birth_year says they could be under 13; unknown birth year = standard rule):
--   * AI chat transcripts: cleared 90 days after the last activity on the row (60 days under 13).
--     Scores, evaluations and evidence on the same row are NOT touched (longitudinal record).
--       dashboard.chat_history / image_chat_history / video_chat_history  -> NULL
--       ai_playground_chats                                               -> row deleted
--       systems_think_sessions.messages                                   -> '[]' (artifact kept)
--   * together_messages: deleted after 12 months.
--   * health_patients: once a patient has at least one assessment and every assessment is resolved,
--     name, village, phone, notes are removed. Age and sex stay for de-identified reporting.
--
-- NOT handled here (needs storage-file deletion, so it will be a script like user:delete):
--   generated images/audio/video and their files, Together attachments, certificates.
--   Nothing is old enough to be affected yet.

-- 1) Let a purge change rows without bumping updated_at. Many screens and the learner-effort
--    reports read dashboard.updated_at as "last activity"; clearing a transcript is not activity.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF coalesce(current_setting('app.retention_purge', true), '') = 'on' THEN
        RETURN NEW;
    END IF;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

-- 2) The purge itself.
CREATE OR REPLACE FUNCTION public.purge_learner_content(dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  this_year     int  := extract(year FROM now())::int;
  n_dash        bigint;
  n_playground  bigint;
  n_systems     bigint;
  n_together    bigint;
  n_patients    bigint;
BEGIN
  PERFORM set_config('app.retention_purge', 'on', true);

  -- "young" = birth year says they could be under 13 (year only, so err toward the younger reading)

  -- dashboard transcripts
  SELECT count(*) INTO n_dash FROM dashboard d
   WHERE (d.chat_history IS NOT NULL AND d.chat_history <> ''
          OR d.image_chat_history IS NOT NULL OR d.video_chat_history IS NOT NULL)
     AND d.updated_at < now() - CASE WHEN d.user_id IN (SELECT id FROM profiles WHERE birth_year >= this_year - 13)
                                     THEN interval '60 days' ELSE interval '90 days' END;
  IF NOT dry_run THEN
    UPDATE dashboard d
       SET chat_history = NULL, image_chat_history = NULL, video_chat_history = NULL
     WHERE (d.chat_history IS NOT NULL AND d.chat_history <> ''
            OR d.image_chat_history IS NOT NULL OR d.video_chat_history IS NOT NULL)
       AND d.updated_at < now() - CASE WHEN d.user_id IN (SELECT id FROM profiles WHERE birth_year >= this_year - 13)
                                       THEN interval '60 days' ELSE interval '90 days' END;
  END IF;

  -- playground chats
  SELECT count(*) INTO n_playground FROM ai_playground_chats c
   WHERE c.updated_at < now() - CASE WHEN c.user_id IN (SELECT id FROM profiles WHERE birth_year >= this_year - 13)
                                     THEN interval '60 days' ELSE interval '90 days' END;
  IF NOT dry_run THEN
    DELETE FROM ai_playground_chats c
     WHERE c.updated_at < now() - CASE WHEN c.user_id IN (SELECT id FROM profiles WHERE birth_year >= this_year - 13)
                                       THEN interval '60 days' ELSE interval '90 days' END;
  END IF;

  -- systems-think conversation (the artifact the learner built stays)
  SELECT count(*) INTO n_systems FROM systems_think_sessions s
   WHERE s.messages <> '[]'::jsonb
     AND s.updated_at < now() - CASE WHEN s.user_id IN (SELECT id FROM profiles WHERE birth_year >= this_year - 13)
                                     THEN interval '60 days' ELSE interval '90 days' END;
  IF NOT dry_run THEN
    UPDATE systems_think_sessions s SET messages = '[]'::jsonb
     WHERE s.messages <> '[]'::jsonb
       AND s.updated_at < now() - CASE WHEN s.user_id IN (SELECT id FROM profiles WHERE birth_year >= this_year - 13)
                                       THEN interval '60 days' ELSE interval '90 days' END;
  END IF;

  -- Together messages
  SELECT count(*) INTO n_together FROM together_messages WHERE created_at < now() - interval '12 months';
  IF NOT dry_run THEN
    DELETE FROM together_messages WHERE created_at < now() - interval '12 months';
  END IF;

  -- finished health consultations: remove the patient's identifiers
  SELECT count(*) INTO n_patients FROM health_patients p
   WHERE p.patient_name <> '[removed]'
     AND EXISTS (SELECT 1 FROM health_assessments a WHERE a.patient_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM health_assessments a WHERE a.patient_id = p.id AND a.resolved IS NOT TRUE);
  IF NOT dry_run THEN
    UPDATE health_patients p
       SET patient_name = '[removed]', village = '[removed]', phone = NULL, notes = NULL
     WHERE p.patient_name <> '[removed]'
       AND EXISTS (SELECT 1 FROM health_assessments a WHERE a.patient_id = p.id)
       AND NOT EXISTS (SELECT 1 FROM health_assessments a WHERE a.patient_id = p.id AND a.resolved IS NOT TRUE);
  END IF;

  RETURN jsonb_build_object(
    'dry_run', dry_run,
    'dashboard_rows_transcripts_cleared', n_dash,
    'playground_chats_deleted', n_playground,
    'systems_think_conversations_cleared', n_systems,
    'together_messages_deleted', n_together,
    'health_patients_identifiers_removed', n_patients
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_learner_content(boolean) FROM PUBLIC, anon, authenticated;

-- To run nightly AFTER the dry run has been reviewed and approved (not done by this migration):
--   SELECT cron.schedule('purge-learner-content', '45 3 * * *', $$ SELECT public.purge_learner_content(false); $$);
