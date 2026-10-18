-- Every organization names a child safety officer (name plus an email or phone/WhatsApp).
--   * New organizations created by a signed-in user must provide one (trigger).
--   * An organization's leaders can set or change it (set_child_safety_officer), and cannot clear it.
--   * A leader cannot approve a learner into an organization that has none (review_membership).
--   * The officer's contact details are shown to that organization's learners and families:
--     get_org_safety_officer(join code) for the public "My path" card, my_safety_officer() for a
--     signed-in member's own organization.
-- Organizations created before this change are not forced to comply at once; their leaders see a card
-- asking them to name one, and cannot approve new learners until they do.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS child_safety_officer_name  text,
  ADD COLUMN IF NOT EXISTS child_safety_officer_email text,
  ADD COLUMN IF NOT EXISTS child_safety_officer_phone text,
  ADD COLUMN IF NOT EXISTS child_safety_officer_set_by uuid,
  ADD COLUMN IF NOT EXISTS child_safety_officer_set_at timestamptz;

CREATE OR REPLACE FUNCTION public.org_has_safety_officer(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM organizations o
     WHERE o.id = p_org
       AND nullif(btrim(o.child_safety_officer_name), '') IS NOT NULL
       AND (nullif(btrim(o.child_safety_officer_email), '') IS NOT NULL
            OR nullif(btrim(o.child_safety_officer_phone), '') IS NOT NULL));
$$;

CREATE OR REPLACE FUNCTION public.guard_new_org_safety_officer()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF nullif(btrim(NEW.child_safety_officer_name), '') IS NULL
       OR (nullif(btrim(NEW.child_safety_officer_email), '') IS NULL
           AND nullif(btrim(NEW.child_safety_officer_phone), '') IS NULL) THEN
      RAISE EXCEPTION 'safety_officer_required: name a child safety officer (with an email or phone) to register an organization';
    END IF;
    NEW.child_safety_officer_set_by := auth.uid();
    NEW.child_safety_officer_set_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_new_org_safety_officer ON public.organizations;
CREATE TRIGGER trg_new_org_safety_officer BEFORE INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_new_org_safety_officer();

CREATE OR REPLACE FUNCTION public.guard_org_safety_officer_clear()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.org_has_safety_officer(OLD.id)
     AND (nullif(btrim(NEW.child_safety_officer_name), '') IS NULL
          OR (nullif(btrim(NEW.child_safety_officer_email), '') IS NULL
              AND nullif(btrim(NEW.child_safety_officer_phone), '') IS NULL)) THEN
    RAISE EXCEPTION 'safety_officer_required: an organization must always have a child safety officer; replace them instead of removing them';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_org_safety_officer_clear ON public.organizations;
CREATE TRIGGER trg_org_safety_officer_clear BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_org_safety_officer_clear();

CREATE OR REPLACE FUNCTION public.set_child_safety_officer(p_org uuid, p_name text, p_email text DEFAULT NULL, p_phone text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n text := nullif(btrim(p_name), ''); e text := nullif(btrim(p_email), ''); ph text := nullif(btrim(p_phone), '');
BEGIN
  IF NOT public.leads_organization(p_org) THEN RAISE EXCEPTION 'Only a leader of this organization can name its child safety officer'; END IF;
  IF n IS NULL OR char_length(n) < 2 THEN RAISE EXCEPTION 'Enter the officer''s name'; END IF;
  IF e IS NULL AND ph IS NULL THEN RAISE EXCEPTION 'Enter an email or a phone/WhatsApp number'; END IF;
  IF e IS NOT NULL AND e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'That email address does not look right'; END IF;
  UPDATE organizations SET child_safety_officer_name = left(n, 120), child_safety_officer_email = left(e, 200),
         child_safety_officer_phone = left(ph, 60), child_safety_officer_set_by = auth.uid(), child_safety_officer_set_at = now()
   WHERE id = p_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organization not found'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_org_safety_officer(p_code text)
RETURNS TABLE(org_name text, officer_name text, officer_email text, officer_phone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT o.name, o.child_safety_officer_name, o.child_safety_officer_email, o.child_safety_officer_phone
    FROM organizations o
   WHERE (upper(btrim(p_code)) = upper(o.join_code) OR upper(btrim(p_code)) = ANY (SELECT upper(c) FROM unnest(coalesce(o.join_codes, '{}'::text[])) c))
     AND public.org_has_safety_officer(o.id)
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.my_safety_officer()
RETURNS TABLE(org_name text, officer_name text, officer_email text, officer_phone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT o.name, o.child_safety_officer_name, o.child_safety_officer_email, o.child_safety_officer_phone
    FROM profiles p
    JOIN organizations o ON o.id = coalesce(p.organization_id, org_id_for_join_code(p.join_code_used))
   WHERE p.id = auth.uid() AND public.org_has_safety_officer(o.id)
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.org_has_safety_officer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_child_safety_officer(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_org_safety_officer(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_safety_officer() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guard_new_org_safety_officer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_org_safety_officer_clear() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.org_has_safety_officer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_child_safety_officer(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_safety_officer(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_safety_officer() TO authenticated;

-- Leaders cannot approve a learner into an organization with no child safety officer.
DO $do$
DECLARE d text; d2 text;
BEGIN
  SELECT pg_get_functiondef('public.review_membership(uuid,text,text,text)'::regprocedure) INTO d;
  d2 := replace(d, E'  IF decision = ''approved'' THEN\n',
    E'  IF decision = ''approved'' THEN\n'
    || E'    IF (SELECT p.role::text FROM profiles p WHERE p.id = target_user) IN (''student'', ''learner'')\n'
    || E'       AND NOT public.org_has_safety_officer(target_org) THEN\n'
    || E'      RAISE EXCEPTION ''safety_officer_required: name your organization''''s child safety officer before approving learners'';\n'
    || E'    END IF;\n');
  IF d2 = d THEN RAISE EXCEPTION 'review_membership not patched'; END IF;
  EXECUTE d2;
END
$do$;

-- Davidson AI Futures Lab (and its duplicate records): Confidence Onuoha
UPDATE public.organizations
   SET child_safety_officer_name = 'Confidence Onuoha',
       child_safety_officer_email = 'confidenceonuoha416@gmail.com',
       child_safety_officer_phone = '+234 806 417 7653',
       child_safety_officer_set_at = now()
 WHERE id IN ('a1b2c3d4-0001-0001-0001-000000000001', '00bd2a68-7ae4-4e70-82de-455e865a9a48',
              '85f12740-d3bf-4f50-b36b-15dc4428bd08', '545d286d-2045-4792-92e5-f2fbec2e895e',
              '089cc033-e2c6-4227-b87f-9e27692c57d6')
   AND child_safety_officer_name IS NULL;
