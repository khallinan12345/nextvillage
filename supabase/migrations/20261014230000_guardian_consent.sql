-- Under-13 tier, step 5: a record of guardian consent, for NEW learners.
--
-- A new learner joins by a join code and waits in "pending" until a leader approves them
-- (review_membership). For a learner who counts as young (is_young_learner), the leader now
-- has to confirm that a parent or guardian has agreed before the approval goes through, and
-- that confirmation is stored. Learners who are already approved are not touched: no record is
-- required of them and nothing about their access changes.
--
-- What is stored is deliberately small: who confirmed, when, how, and a short note. No
-- guardian name, phone or email is kept here (the signed form itself stays with the program).
--
-- REQUIRES migration 20261014200000_under13_hide_names (is_young_learner).

CREATE TABLE IF NOT EXISTS public.guardian_consents (
  learner_id      uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  confirmed_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmed_at    timestamptz NOT NULL DEFAULT now(),
  method          text NOT NULL CHECK (method IN ('signed_form', 'in_person', 'other')),
  note            text CHECK (note IS NULL OR char_length(note) <= 500)
);

ALTER TABLE public.guardian_consents ENABLE ROW LEVEL SECURITY;

-- New tables are auto-granted to anon and authenticated on Supabase; take it all back, then
-- allow leaders to READ only. Writes happen through review_membership().
REVOKE ALL ON public.guardian_consents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.guardian_consents TO authenticated;

DROP POLICY IF EXISTS leaders_read_consents ON public.guardian_consents;
CREATE POLICY leaders_read_consents ON public.guardian_consents
  FOR SELECT TO authenticated
  USING (
    (SELECT role FROM public.get_my_profile()) = 'platform_administrator'
    OR (
      (SELECT role FROM public.get_my_profile()) IN ('site_leader', 'leader', 'teacher', 'facilitator')
      AND organization_id = (SELECT organization_id FROM public.get_my_effective_profile())
    )
  );

-- Does approving this person still need a guardian-consent confirmation? Same leader check as
-- review_membership().
CREATE OR REPLACE FUNCTION public.membership_needs_consent(target_user uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me_role    text;
  me_org     uuid;
  me_status  text;
  target_org uuid;
BEGIN
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

  RETURN public.is_young_learner(target_user)
     AND NOT EXISTS (SELECT 1 FROM guardian_consents g WHERE g.learner_id = target_user);
END;
$$;
REVOKE ALL ON FUNCTION public.membership_needs_consent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.membership_needs_consent(uuid) TO authenticated;

-- review_membership gains an optional consent confirmation. The old two-argument version is
-- dropped so there is no way around the check; calls with two arguments still work.
DROP FUNCTION IF EXISTS public.review_membership(uuid, text);

CREATE OR REPLACE FUNCTION public.review_membership(
  target_user    uuid,
  decision       text,
  consent_method text DEFAULT NULL,
  consent_note   text DEFAULT NULL
)
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
  needs      boolean;
BEGIN
  IF decision NOT IN ('approved', 'declined') THEN
    RAISE EXCEPTION 'decision must be approved or declined';
  END IF;
  IF target_user = auth.uid() THEN
    RAISE EXCEPTION 'You cannot review your own membership';
  END IF;
  IF consent_method IS NOT NULL AND consent_method NOT IN ('signed_form', 'in_person', 'other') THEN
    RAISE EXCEPTION 'consent_method must be signed_form, in_person or other';
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

  IF decision = 'approved' THEN
    needs := public.is_young_learner(target_user)
             AND NOT EXISTS (SELECT 1 FROM guardian_consents g WHERE g.learner_id = target_user);
    IF needs THEN
      IF consent_method IS NULL THEN
        RAISE EXCEPTION 'consent_required: confirm that a parent or guardian has agreed before approving this learner';
      END IF;
      INSERT INTO guardian_consents (learner_id, organization_id, confirmed_by, method, note)
      VALUES (target_user, target_org, auth.uid(), consent_method, left(consent_note, 500))
      ON CONFLICT (learner_id) DO NOTHING;
    END IF;
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
REVOKE ALL ON FUNCTION public.review_membership(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_membership(uuid, text, text, text) TO authenticated;
