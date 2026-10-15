-- Under-13 tier, step 4: young learners cannot create or read records about other people.
--
-- The community-service advisor tools (healthcare, agriculture, fishing, animal husbandry,
-- entrepreneurship) store a non-user's name, village, phone number and, for health, triage
-- summaries. Those people have no account, no notice and no way to ask for deletion, so young
-- learners are kept out of these tables entirely (the pages are hidden in the app as well).
--
-- REQUIRES migration 20261014200000_under13_hide_names (is_young_learner).

-- Is the signed-in user young? Only ever answers about the caller, so it is safe to expose.
CREATE OR REPLACE FUNCTION public.viewer_is_young()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT public.is_young_learner(auth.uid()); $$;
REVOKE ALL ON FUNCTION public.viewer_is_young() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.viewer_is_young() TO authenticated, service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'health_patients', 'health_assessments',
    'agriculture_farmers', 'agriculture_consultations',
    'animal_husbandry_farmers', 'animal_husbandry_consultations',
    'fishing_clients', 'fishing_consultations',
    'entrepreneurship_clients', 'entrepreneurship_consultations'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS no_records_about_others_for_young ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY no_records_about_others_for_young ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT (SELECT public.viewer_is_young()))',
      t);
  END LOOP;
END $$;
