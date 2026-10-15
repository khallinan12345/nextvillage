-- Guardian consent for every learner who is, or may be, under 18 (Kevin's decision, 2026-10-15; the
-- signed forms are already collected offline by leaders. This makes the platform keep the record).
--
-- "Minor" here means a learner (role student or learner) whose birth year puts them under 18 (year
-- only, so the younger reading), or with no birth year yet in an organization whose minimum learner
-- age is under 18. This is separate from is_young_learner(), which still decides the stricter
-- under-13 protections.
--
--   * New learners cannot be approved until a leader records consent (review_membership).
--   * Learners already approved are NOT switched off. Leaders record consent for them in batches
--     (record_guardian_consents) from the "Learners without a recorded consent" card.

CREATE OR REPLACE FUNCTION public.is_minor_learner(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((
    SELECT p.role::text IN ('student', 'learner')
       AND CASE
             WHEN p.birth_year IS NOT NULL
               THEN p.birth_year >= extract(year FROM now())::int - 18
             ELSE coalesce((SELECT o.learner_age_min < 18
                              FROM organizations o
                             WHERE o.id = coalesce(p.organization_id, org_id_for_join_code(p.join_code_used))), false)
           END
    FROM profiles p
    WHERE p.id = p_user
  ), false);
$$;
REVOKE ALL ON FUNCTION public.is_minor_learner(uuid) FROM PUBLIC, anon, authenticated;

-- Does approving this person still need a guardian-consent confirmation?
CREATE OR REPLACE FUNCTION public.membership_needs_consent(target_user uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_org uuid;
BEGIN
  SELECT coalesce(p.organization_id, org_id_for_join_code(p.join_code_used))
    INTO target_org FROM profiles p WHERE p.id = target_user;
  IF target_org IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF NOT public.can_handle_requests_for(target_org) THEN
    RAISE EXCEPTION 'Only a leader of this organization can review its members';
  END IF;
  RETURN public.is_minor_learner(target_user)
     AND NOT EXISTS (SELECT 1 FROM guardian_consents g WHERE g.learner_id = target_user);
END;
$$;
REVOKE ALL ON FUNCTION public.membership_needs_consent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.membership_needs_consent(uuid) TO authenticated;

-- review_membership: same as before, but the consent test is now "under 18" not "under 13".
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
    needs := public.is_minor_learner(target_user)
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

-- Approved learners under 18 with no recorded consent, in the caller's organization(s).
CREATE OR REPLACE FUNCTION public.list_learners_missing_consent()
RETURNS TABLE(id uuid, name text, email text, birth_year smallint, organization_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.email, p.birth_year, o.name
    FROM profiles p
    JOIN organizations o ON o.id = coalesce(p.organization_id, org_id_for_join_code(p.join_code_used))
   WHERE p.membership_status = 'approved'
     AND public.is_minor_learner(p.id)
     AND NOT EXISTS (SELECT 1 FROM guardian_consents g WHERE g.learner_id = p.id)
     AND public.can_handle_requests_for(o.id)
   ORDER BY o.name, p.name;
$$;
REVOKE ALL ON FUNCTION public.list_learners_missing_consent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_learners_missing_consent() TO authenticated;

-- A leader records that the guardian consent (signed form, in-person agreement, other) is on file
-- for these learners. Skips anyone the caller may not handle, and anyone who already has a record.
CREATE OR REPLACE FUNCTION public.record_guardian_consents(p_users uuid[], p_method text, p_note text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u uuid;
  org uuid;
  n integer := 0;
BEGIN
  IF p_method NOT IN ('signed_form', 'in_person', 'other') THEN
    RAISE EXCEPTION 'method must be signed_form, in_person or other';
  END IF;
  IF p_method = 'other' AND coalesce(trim(p_note), '') = '' THEN
    RAISE EXCEPTION 'Add a short note when the method is "other"';
  END IF;
  FOREACH u IN ARRAY p_users LOOP
    SELECT coalesce(p.organization_id, org_id_for_join_code(p.join_code_used)) INTO org
      FROM profiles p WHERE p.id = u AND p.role::text IN ('student', 'learner');
    CONTINUE WHEN org IS NULL OR NOT public.can_handle_requests_for(org);
    INSERT INTO guardian_consents (learner_id, organization_id, confirmed_by, method, note)
    VALUES (u, org, auth.uid(), p_method, left(p_note, 500))
    ON CONFLICT (learner_id) DO NOTHING;
    IF FOUND THEN n := n + 1; END IF;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.record_guardian_consents(uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_guardian_consents(uuid[], text, text) TO authenticated;
