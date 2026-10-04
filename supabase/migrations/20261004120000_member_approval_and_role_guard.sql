-- Leader approval for new organization members, plus the database-side
-- guards that make that approval impossible to skip.
--
-- Before this migration:
--   * profiles_update let any signed-in user write ANY column of their own
--     row — including role — so anyone could make themselves a
--     platform_administrator from the browser console.
--   * Entering a join code put you straight into the organization (Together
--     rooms, member lists, leaderboards) with no human check.
--   * organizations was readable in full by every signed-in user, join codes
--     included, so a "private" join code wasn't actually private.
--   * Any signed-in user could take over an organization whose leader_id was
--     NULL, and could create an org whose join code duplicated another
--     org's code (hijacking anyone who typed that code at signup).
--
-- After:
--   * Joining an existing org (as a learner or a co-leader) puts the profile
--     in membership_status = 'pending'. Until a leader of that org approves
--     it, get_my_profile() / get_my_effective_profile() report no
--     organization (and the role 'student'), so every RLS policy built on
--     them treats the person as outside the org.
--   * Leaders approve or decline via review_membership(). That is the only
--     way (besides a platform administrator) to change membership_status.
--   * Nobody but a platform administrator can change a role once the
--     profile is completed, and self-chosen roles are limited to the two
--     the signup form offers (student, site_leader).
--   * Existing members are all marked 'approved', so nobody is locked out.

-- ── 1. Membership columns ─────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS membership_status text NOT NULL DEFAULT 'approved'
    CHECK (membership_status IN ('approved', 'pending', 'declined')),
  ADD COLUMN IF NOT EXISTS membership_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS membership_reviewed_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS membership_reviewed_at  timestamptz;

CREATE INDEX IF NOT EXISTS profiles_pending_members_idx
  ON public.profiles (organization_id)
  WHERE membership_status = 'pending';

-- ── 2. Resolve a join code to its org (used by several functions below) ───

CREATE OR REPLACE FUNCTION public.org_id_for_join_code(code text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id
  FROM organizations o
  WHERE nullif(trim(code), '') IS NOT NULL
    AND (o.join_code = upper(trim(code)) OR upper(trim(code)) = ANY (o.join_codes))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.org_id_for_join_code(text) FROM PUBLIC, anon, authenticated;

-- ── 3. Guard trigger on profiles ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_profile_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller        uuid := auth.uid();
  caller_role   text;
  org_changed   boolean;
  effective_org uuid;
BEGIN
  -- No end-user identity: service-role API routes, migrations, the SQL
  -- editor. Those are already trusted server-side code.
  IF caller IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.role::text INTO caller_role
  FROM profiles p
  WHERE p.id = caller AND p.membership_status = 'approved';

  IF caller_role = 'platform_administrator' THEN
    RETURN NEW;
  END IF;

  -- ── Someone editing another person's row (RLS already limits this to a
  --    site_leader of the same org) ───────────────────────────────────────
  IF TG_OP = 'UPDATE' AND NEW.id <> caller THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Only a platform administrator can change a member''s role';
    END IF;
    IF NEW.is_primary_leader IS DISTINCT FROM OLD.is_primary_leader THEN
      RAISE EXCEPTION 'Only a platform administrator can change the primary leader';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.join_code_used IS DISTINCT FROM OLD.join_code_used THEN
      RAISE EXCEPTION 'Only a platform administrator can move members between organizations';
    END IF;
    IF (NEW.membership_status      IS DISTINCT FROM OLD.membership_status
        OR NEW.membership_reviewed_by IS DISTINCT FROM OLD.membership_reviewed_by
        OR NEW.membership_reviewed_at IS DISTINCT FROM OLD.membership_reviewed_at
        OR NEW.membership_requested_at IS DISTINCT FROM OLD.membership_requested_at)
       AND coalesce(current_setting('app.membership_review', true), '') <> 'on' THEN
      RAISE EXCEPTION 'Use review_membership() to approve or decline members';
    END IF;
    RETURN NEW;
  END IF;

  -- ── A person creating or editing their own row ────────────────────────
  IF NEW.id <> caller THEN
    RAISE EXCEPTION 'You can only create your own profile';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role::text NOT IN ('student', 'site_leader') THEN
      RAISE EXCEPTION 'That role can only be assigned by a platform administrator';
    END IF;
    NEW.membership_status       := 'approved';
    NEW.membership_requested_at := NULL;
    NEW.membership_reviewed_by  := NULL;
    NEW.membership_reviewed_at  := NULL;
    org_changed := NEW.organization_id IS NOT NULL
                   OR nullif(trim(NEW.join_code_used), '') IS NOT NULL;
  ELSE
    -- Role: chosen once, on the signup form, from the two roles it offers.
    IF NEW.role IS DISTINCT FROM OLD.role
       AND (coalesce(OLD.profile_completed, false)
            OR NEW.role::text NOT IN ('student', 'site_leader')) THEN
      RAISE EXCEPTION 'Your role can only be changed by a platform administrator';
    END IF;
    -- Membership fields are never self-editable.
    NEW.membership_status       := OLD.membership_status;
    NEW.membership_requested_at := OLD.membership_requested_at;
    NEW.membership_reviewed_by  := OLD.membership_reviewed_by;
    NEW.membership_reviewed_at  := OLD.membership_reviewed_at;
    org_changed := NEW.organization_id IS DISTINCT FROM OLD.organization_id
                   OR NEW.join_code_used IS DISTINCT FROM OLD.join_code_used;
  END IF;

  -- Joining (or switching to) an org needs a leader's approval — unless the
  -- caller is that org's registered leader (i.e. they just created it).
  IF org_changed THEN
    effective_org := coalesce(NEW.organization_id,
                              org_id_for_join_code(NEW.join_code_used));
    IF effective_org IS NULL THEN
      NEW.membership_status       := 'approved';
      NEW.membership_requested_at := NULL;
    ELSIF EXISTS (SELECT 1 FROM organizations o
                  WHERE o.id = effective_org AND o.leader_id = caller) THEN
      NEW.membership_status       := 'approved';
      NEW.membership_requested_at := NULL;
    ELSE
      NEW.membership_status       := 'pending';
      NEW.membership_requested_at := now();
    END IF;
    NEW.membership_reviewed_by := NULL;
    NEW.membership_reviewed_at := NULL;
  END IF;

  -- is_primary_leader is only true for the org's registered leader.
  IF TG_OP = 'INSERT' OR NEW.is_primary_leader IS DISTINCT FROM OLD.is_primary_leader THEN
    NEW.is_primary_leader := coalesce(NEW.is_primary_leader, false) AND EXISTS (
      SELECT 1 FROM organizations o
      WHERE o.id = NEW.organization_id AND o.leader_id = caller
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_profile_changes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_profile_changes ON public.profiles;
CREATE TRIGGER guard_profile_changes
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_changes();

-- ── 4. Leaders approve / decline ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.review_membership(target_user uuid, decision text)
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
  IF decision NOT IN ('approved', 'declined') THEN
    RAISE EXCEPTION 'decision must be approved or declined';
  END IF;
  IF target_user = auth.uid() THEN
    RAISE EXCEPTION 'You cannot review your own membership';
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
    RAISE EXCEPTION 'Only a leader of this organization can review its members';
  END IF;

  PERFORM set_config('app.membership_review', 'on', true);
  UPDATE profiles
     SET membership_status      = decision,
         membership_reviewed_by = auth.uid(),
         membership_reviewed_at = now()
   WHERE id = target_user;
  PERFORM set_config('app.membership_review', 'off', true);
END;
$$;

REVOKE ALL ON FUNCTION public.review_membership(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_membership(uuid, text) TO authenticated;

-- ── 5. RLS helpers: pending/declined members are outside the org ──────────
-- Every org-scoped policy goes through one of these two functions, so
-- changing them here is what actually keeps a pending member out of rooms,
-- member lists and leaderboards.

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE(role text, organization_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE WHEN p.membership_status = 'approved' THEN p.role::text ELSE 'student' END,
    CASE WHEN p.membership_status = 'approved' THEN p.organization_id END
  FROM profiles p
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_effective_profile()
RETURNS TABLE(role text, organization_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE WHEN p.membership_status = 'approved' THEN p.role::text ELSE 'student' END,
    CASE WHEN p.membership_status = 'approved'
         THEN coalesce(p.organization_id, org_id_for_join_code(p.join_code_used))
    END
  FROM profiles p
  WHERE p.id = auth.uid();
$$;

-- ── 6. Organizations: keep join codes private, close takeover paths ──────

-- Members (approved) read their own org; leaders already read theirs via
-- leader_own_org; admins via platform_admin_all.
DROP POLICY IF EXISTS public_read_by_join_code ON public.organizations;
DROP POLICY IF EXISTS members_read_own_org ON public.organizations;
CREATE POLICY members_read_own_org ON public.organizations
  FOR SELECT TO authenticated
  USING (id = (SELECT organization_id FROM public.get_my_effective_profile()));

-- Creating an org makes you its leader — never someone else.
DROP POLICY IF EXISTS authenticated_users_can_create_org ON public.organizations;
CREATE POLICY authenticated_users_can_create_org ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (leader_id = auth.uid());

-- An org with no registered leader can be edited/claimed only by an
-- approved leader of that org (previously: by anyone).
DROP POLICY IF EXISTS leader_can_set_leader_id ON public.organizations;
CREATE POLICY leader_can_set_leader_id ON public.organizations
  FOR UPDATE TO authenticated
  USING (
    leader_id IS NULL
    AND id = (SELECT organization_id FROM public.get_my_profile())
    AND (SELECT role FROM public.get_my_profile()) IN ('site_leader', 'leader')
  )
  WITH CHECK (leader_id IS NULL OR leader_id = auth.uid());

-- Join codes must be unique across orgs, so a leaked code can't be reused
-- by a look-alike org to capture people signing up.
CREATE OR REPLACE FUNCTION public.ensure_unique_join_codes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM organizations o
    WHERE o.id <> NEW.id
      AND (o.join_codes && coalesce(NEW.join_codes, '{}')
           OR o.join_code = ANY (coalesce(NEW.join_codes, '{}'))
           OR NEW.join_code = ANY (o.join_codes)
           OR o.join_code = NEW.join_code)
  ) THEN
    RAISE EXCEPTION 'That join code is already used by another organization';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_unique_join_codes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ensure_unique_join_codes ON public.organizations;
CREATE TRIGGER ensure_unique_join_codes
  BEFORE INSERT OR UPDATE OF join_code, join_codes ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.ensure_unique_join_codes();

-- These two read across all orgs, which members can no longer do directly.
-- find_org_by_join_code returns only an org's public-facing fields, never
-- its codes.
ALTER FUNCTION public.find_org_by_join_code(text) SECURITY DEFINER;
ALTER FUNCTION public.find_org_by_join_code(text) SET search_path = public;
REVOKE ALL ON FUNCTION public.find_org_by_join_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_org_by_join_code(text) TO authenticated;

ALTER FUNCTION public.generate_join_code() SECURITY DEFINER;
ALTER FUNCTION public.generate_join_code() SET search_path = public;
REVOKE ALL ON FUNCTION public.generate_join_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_join_code() TO authenticated;
