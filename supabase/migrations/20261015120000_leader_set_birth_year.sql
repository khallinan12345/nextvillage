-- Lets a leader record a member's birth year (from a registration form, for example) so the
-- under-13 protections apply correctly without waiting for the learner's own prompt answer.
-- Same leader check as review_membership(): platform admin, the organization's leader_id,
-- or an approved leader / site_leader of that organization.

CREATE OR REPLACE FUNCTION public.set_member_birth_year(target_user uuid, new_birth_year integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me_role    text;
  me_org     uuid;
  me_status  text;
  target_org uuid;
BEGIN
  IF new_birth_year IS NULL
     OR new_birth_year < 1920
     OR new_birth_year > extract(year FROM now())::int THEN
    RAISE EXCEPTION 'Birth year must be between 1920 and this year';
  END IF;

  SELECT p.role::text, p.organization_id, p.membership_status
    INTO me_role, me_org, me_status
  FROM profiles p WHERE p.id = auth.uid();

  SELECT coalesce(p.organization_id, org_id_for_join_code(p.join_code_used))
    INTO target_org
  FROM profiles p WHERE p.id = target_user;

  IF target_org IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF NOT (
       me_role = 'platform_administrator'
    OR EXISTS (SELECT 1 FROM organizations o WHERE o.id = target_org AND o.leader_id = auth.uid())
    OR (me_status = 'approved' AND me_role IN ('site_leader', 'leader') AND me_org = target_org)
  ) THEN
    RAISE EXCEPTION 'Only a leader of this organization can set a member''s birth year';
  END IF;

  UPDATE profiles SET birth_year = new_birth_year WHERE id = target_user;
END;
$$;
REVOKE ALL ON FUNCTION public.set_member_birth_year(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_birth_year(uuid, integer) TO authenticated;
