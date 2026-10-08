-- Run the stats snapshot once a month.
--
-- snapshot-dashboard-stats rebuilds dashboard_stats from the monthly
-- assessments and the dashboard. Nothing scheduled it before, so the public
-- statistics stopped updating after the last manual run.
--
-- Timing: the monthly assessments run on the 1st at 02:00 UTC (vercel.json),
-- so the snapshot runs on the 2nd at 06:00 UTC, after they have finished.
--
-- The service key is read from the Supabase vault, as the other scheduled
-- jobs do; no secret is stored in this file. cron.schedule() with an existing
-- job name replaces that job, so running this twice is safe.

SELECT cron.schedule(
  'snapshot-dashboard-stats-monthly',
  '0 6 2 * *',
  $job$
    SELECT net.http_post(
      url     := 'https://wohmsbeygxrbwogrggkq.supabase.co/functions/v1/snapshot-dashboard-stats',
      headers := ('{"Content-Type":"application/json","Authorization":"Bearer ' ||
                  (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key') ||
                  '"}')::jsonb,
      body    := '{}'::jsonb
    );
  $job$
);
