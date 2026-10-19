-- A child safety officer is required only for Davidson AI Futures Lab, Maji Mazuri and Open Mind Africa
-- (Kevin, 19 Oct 2026). Every other organization needs none: a leader can approve members without one.
-- An organization that has named an officer anyway keeps showing it.
--
--   organizations.requires_safety_officer   true for the three organizations above, false for the rest
--   org_safety_officer_satisfied(org)       true when the organization needs none, or has named one
--   review_membership()                     now checks the new function instead of org_has_safety_officer()
--
-- org_has_safety_officer() is unchanged: it still means "has an officer named" and still protects an
-- officer from being cleared.

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS requires_safety_officer boolean NOT NULL DEFAULT false;

UPDATE public.organizations SET requires_safety_officer = (name IN ('Davidson AI Futures Lab', 'Maji Mazuri', 'Open Mind Africa'));

CREATE OR REPLACE FUNCTION public.org_safety_officer_satisfied(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT NOT coalesce((SELECT o.requires_safety_officer FROM organizations o WHERE o.id = p_org), true)
         OR public.org_has_safety_officer(p_org);
$$;
REVOKE ALL ON FUNCTION public.org_safety_officer_satisfied(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_safety_officer_satisfied(uuid) TO authenticated;

DO $do$
DECLARE d text; d2 text;
BEGIN
  SELECT pg_get_functiondef('public.review_membership(uuid,text,text,text)'::regprocedure) INTO d;
  d2 := replace(d, 'NOT public.org_has_safety_officer(target_org)', 'NOT public.org_safety_officer_satisfied(target_org)');
  IF d2 = d THEN RAISE EXCEPTION 'review_membership not patched'; END IF;
  EXECUTE d2;
END
$do$;
