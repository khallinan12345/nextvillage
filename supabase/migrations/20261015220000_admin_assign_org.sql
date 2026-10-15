-- People who sign up without a join code belong to no organization, so no leader sees them,
-- receives their safety alerts or can confirm a guardian's consent. These two functions let a
-- platform administrator list them and place each in an organization.

CREATE OR REPLACE FUNCTION public.list_members_without_org()
RETURNS TABLE(id uuid, name text, email text, role text, country text, birth_year smallint,
              is_young boolean, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles me WHERE me.id = auth.uid() AND me.role::text = 'platform_administrator') THEN
    RAISE EXCEPTION 'Administrators only';
  END IF;
  RETURN QUERY
  SELECT p.id, p.name, p.email, p.role::text, p.country, p.birth_year,
         public.is_young_learner(p.id), u.created_at
    FROM profiles p JOIN auth.users u ON u.id = p.id
   WHERE p.role::text IN ('student', 'learner', 'teacher')
     AND p.organization_id IS NULL
     AND org_id_for_join_code(p.join_code_used) IS NULL
   ORDER BY public.is_young_learner(p.id) DESC, u.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.list_members_without_org() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_members_without_org() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_assign_member_org(target_user uuid, target_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles me WHERE me.id = auth.uid() AND me.role::text = 'platform_administrator') THEN
    RAISE EXCEPTION 'Administrators only';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = target_org) THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;
  UPDATE profiles SET organization_id = target_org WHERE id = target_user AND organization_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found or already in an organization'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_assign_member_org(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_member_org(uuid, uuid) TO authenticated;
