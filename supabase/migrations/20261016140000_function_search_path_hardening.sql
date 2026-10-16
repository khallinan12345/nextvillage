-- Scanner cleanup (16 Oct 2026).
--
-- 1) Give the 41 public functions that had no fixed search_path one (public, pg_temp). A function that
--    resolves names through the caller's search_path can be tricked into running a look-alike object;
--    pinning it removes that. None of them calls an extension function, so nothing changes in behaviour.
-- 2) get_session_mix_by_stage() is used nowhere in the app: remove access for signed-out and signed-in
--    users (the service role keeps it).

ALTER FUNCTION public.anchor_due_checkpoint(integer,integer[],integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.award_bridge_tier_on_referral() SET search_path = public, pg_temp;
ALTER FUNCTION public.award_multiplier_on_mentee_completion() SET search_path = public, pg_temp;
ALTER FUNCTION public.backfill_dashboard_stats(date,date) SET search_path = public, pg_temp;
ALTER FUNCTION public.carry_over_grand_submission(uuid,uuid,text) SET search_path = public, pg_temp;
ALTER FUNCTION public.close_grand_challenge_quarter(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.create_grade_appropriate_dashboard_activities_by_continent(uuid,text) SET search_path = public, pg_temp;
ALTER FUNCTION public.create_grade_appropriate_dashboard_activities_by_country(uuid,text) SET search_path = public, pg_temp;
ALTER FUNCTION public.expire_old_enrollments() SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_team_code() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_dashboard_summary(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_longitudinal_summary(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_research_snapshot(text,date,date,text) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_session_band_stats() SET search_path = public, pg_temp;
ALTER FUNCTION public.grade_band(integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.learner_token(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.refresh_contribution_summary() SET search_path = public, pg_temp;
ALTER FUNCTION public.refresh_dashboard(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.refresh_user_dashboard(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.resolve_site(text,text) SET search_path = public, pg_temp;
ALTER FUNCTION public.set_org_leader_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.set_team_code() SET search_path = public, pg_temp;
ALTER FUNCTION public.set_team_name() SET search_path = public, pg_temp;
ALTER FUNCTION public.set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.show_current_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.site_org_id(uuid,text) SET search_path = public, pg_temp;
ALTER FUNCTION public.tier_rank(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_model_config() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_agc_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_agf_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_ahc_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_ahf_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_econ_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_ec_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_fcon_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_fc_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_ha_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_hp_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_grand() SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_session_mix_by_stage() FROM PUBLIC, anon, authenticated;
