-- The "generate-weekly-challenges" pg_cron job (id 14, every Sunday 20:15
-- UTC) was calling the same edge function the Admin > Create Challenge
-- panel's Publish button uses — but it was never tracked in a migration
-- (set up directly against the DB), and it fired weekly against a function
-- that runs a 14-day cycle. That mismatch left community_challenges with
-- two "active" rows out of sync (the new 14-day challenge inserted but not
-- flagged active, the prior one never deactivated), which broke the
-- Dashboard's Community Impact / bi-weekly challenge leaderboard.
--
-- Per product decision: bi-weekly community challenge creation should only
-- happen through the Admin panel, not on an automatic schedule.

SELECT cron.unschedule('generate-weekly-challenges');
