-- Together safety flags (the flagged message excerpt, sender name, room) are safeguarding records, kept
-- two years like the safety_flag_* events in system_events, then deleted. Adds that rule to the nightly
-- operational-log purge, which previously covered only system_events, cost logs, and code-run logs.

CREATE OR REPLACE FUNCTION public.purge_operational_logs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  n_events bigint;
  n_safety bigint;
  n_cost   bigint;
  n_code   bigint;
  n_together bigint;
BEGIN
  DELETE FROM system_events
   WHERE created_at < now() - interval '180 days'
     AND event_type NOT LIKE 'safety\_flag\_%';
  GET DIAGNOSTICS n_events = ROW_COUNT;

  DELETE FROM system_events
   WHERE created_at < now() - interval '2 years'
     AND event_type LIKE 'safety\_flag\_%';
  GET DIAGNOSTICS n_safety = ROW_COUNT;

  DELETE FROM together_safety_flags
   WHERE created_at < now() - interval '2 years';
  GET DIAGNOSTICS n_together = ROW_COUNT;

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
    'together_safety_flags_deleted', n_together,
    'api_cost_rows_detached', n_cost,
    'code_runs_deleted', n_code
  );
END;
$function$;
