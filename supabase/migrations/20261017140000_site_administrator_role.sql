-- New role: site_administrator (the enum value is added in the previous step).
--
-- Meaning: a site administrator has everything a site leader has at their own site, and counts as part
-- of the platform team in the Team workspace. It does NOT see other organizations' data and cannot
-- change roles, move members between organizations, or merge accounts: those stay with the platform
-- administrator. It cannot be chosen at sign-up (guard_profile_changes only lets people pick student or
-- site_leader for themselves).
--
-- Done by rewriting the existing definitions, so nothing else changes:
--   * get_my_profile() / get_my_effective_profile() report a site administrator as 'site_leader', which
--     makes every policy that uses them apply to site administrators too;
--   * the functions and policies that check the role directly get 'site_administrator' added next to
--     'site_leader';
--   * is_platform_team() (Team workspace) includes site administrators.

DO $do$
DECLARE
  r record;
  d text;
  d2 text;
  q text;
  c text;
  stmt text;
BEGIN
  -- 1. helpers
  FOR r IN SELECT p.oid FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
           AND p.proname IN ('get_my_profile', 'get_my_effective_profile') LOOP
    d := pg_get_functiondef(r.oid);
    d2 := replace(d, 'THEN p.role::text ELSE', $b$THEN CASE WHEN p.role::text = 'site_administrator' THEN 'site_leader' ELSE p.role::text END ELSE$b$);
    IF d2 = d THEN RAISE EXCEPTION 'helper not rewritten: %', r.oid::regprocedure; END IF;
    EXECUTE d2;
  END LOOP;

  -- 2. functions that check the role directly
  FOR r IN SELECT p.oid FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
           AND p.proname IN ('can_handle_requests_for', 'get_learner_growth', 'get_organization_learner_count',
                             'get_research_snapshot', 'is_team_member', 'leads_organization', 'review_membership',
                             'set_member_birth_year', 'udolli_is_instructor') LOOP
    d := pg_get_functiondef(r.oid);
    d2 := replace(d, '''site_leader''', '''site_leader'', ''site_administrator''');
    -- some overloads do not mention the role at all
    IF d2 <> d THEN EXECUTE d2; END IF;
  END LOOP;

  FOR r IN SELECT p.oid FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'is_platform_team' LOOP
    d := pg_get_functiondef(r.oid);
    d2 := replace(d, '''research_lead''', '''research_lead'', ''site_administrator''');
    IF d2 = d THEN RAISE EXCEPTION 'is_platform_team not rewritten'; END IF;
    EXECUTE d2;
  END LOOP;

  -- 3. policies that list the role directly (the rest go through get_my_profile)
  FOR r IN SELECT schemaname, tablename, policyname, qual, with_check FROM pg_policies
           WHERE schemaname = 'public' AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%''site_leader''::user_role%' LOOP
    q := replace(coalesce(r.qual, ''), '''site_leader''::user_role', '''site_leader''::user_role, ''site_administrator''::user_role');
    c := replace(coalesce(r.with_check, ''), '''site_leader''::user_role', '''site_leader''::user_role, ''site_administrator''::user_role');
    stmt := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF r.qual IS NOT NULL THEN stmt := stmt || ' USING (' || q || ')'; END IF;
    IF r.with_check IS NOT NULL THEN stmt := stmt || ' WITH CHECK (' || c || ')'; END IF;
    EXECUTE stmt;
  END LOOP;
END
$do$;
