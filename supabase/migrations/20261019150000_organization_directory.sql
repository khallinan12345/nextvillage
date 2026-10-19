-- One official list of organizations.
--
--   * organizations.is_listed marks the organizations people may pick from at sign-up and the platform
--     administrator may place members into. Everything else stays in the database but is not offered.
--   * The four duplicate "Davidson ..." records (made by learners who typed an organization name at
--     sign-up) are merged into Davidson AI Futures Lab. Their old join codes keep working on it.
--   * "nextVillage Funders" becomes "US - general" (the place funders trying the platform join).
--   * The "test foundation" record is removed.
--   * New organizations: Africa - general, Green County CC, Eastern Illinois University,
--     Mt. St. Joseph's University, Gem City Career Prep.
--   * list_joinable_organizations(): the list for the sign-up dropdown. Join codes are not included.
--   * Only a platform administrator can create an organization from now on (the sign-up form no longer
--     offers it), so duplicates and misspellings cannot come back.

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_listed boolean NOT NULL DEFAULT false;

DO $$
DECLARE
  main  uuid := 'a1b2c3d4-0001-0001-0001-000000000001';
  dupes uuid[] := array['00bd2a68-7ae4-4e70-82de-455e865a9a48','545d286d-2045-4792-92e5-f2fbec2e895e',
                        '089cc033-e2c6-4227-b87f-9e27692c57d6','85f12740-d3bf-4f50-b36b-15dc4428bd08']::uuid[];
  extra text[];
BEGIN
  UPDATE profiles                  SET organization_id = main WHERE organization_id = ANY(dupes);
  UPDATE learning_modules          SET organization_id = main WHERE organization_id = ANY(dupes);
  UPDATE teams                     SET organization_id = main WHERE organization_id = ANY(dupes);
  -- one row per month per organization: where the surviving organization already has the month, drop the duplicate's
  DELETE FROM assessments_monthly_global a USING assessments_monthly_global b
   WHERE a.organization_id = ANY(dupes) AND b.organization_id = main AND a.period_start = b.period_start;
  UPDATE assessments_monthly_global SET organization_id = main WHERE organization_id = ANY(dupes);
  UPDATE together_rooms            SET organization_id = main WHERE organization_id = ANY(dupes);
  UPDATE student_games             SET organization_id = main WHERE organization_id = ANY(dupes);
  UPDATE student_sites             SET organization_id = main WHERE organization_id = ANY(dupes);
  UPDATE together_safety_flags     SET organization_id = main WHERE organization_id = ANY(dupes);
  UPDATE guardian_consents         SET organization_id = main WHERE organization_id = ANY(dupes);
  UPDATE data_requests             SET organization_id = main WHERE organization_id = ANY(dupes);
  UPDATE inactive_account_reviews  SET organization_id = main WHERE organization_id = ANY(dupes);

  -- keep every old join code working on the surviving organization. A code may belong to only one
  -- organization at a time, so remember the codes, delete the duplicates, then add the codes to the main one.
  SELECT array_agg(DISTINCT c) INTO extra FROM organizations o, unnest(o.join_codes) c WHERE o.id = ANY(dupes);
  DELETE FROM organizations WHERE id = ANY(dupes);
  UPDATE organizations
     SET join_codes = (SELECT array_agg(DISTINCT c) FROM unnest(join_codes || coalesce(extra, '{}')) c)
   WHERE id = main;
END $$;

-- Funders
UPDATE public.organizations SET name = 'US - general'
 WHERE id = '0fddc609-fdfd-4d92-a576-0c8ae7dcae1f' AND name = 'nextVillage Funders';

-- The test record
DELETE FROM public.organizations WHERE id = '83f96f09-a81b-4c0d-9ff6-090e7ceaeff3' AND name = 'test foundation';

-- New organizations (Kevin leads them until a real leader is assigned; each still needs a child safety
-- officer named before anyone can be approved)
INSERT INTO public.organizations (name, join_code, join_codes, leader_id, continent, country)
SELECT v.name, c.code, array[c.code], '0e738663-a70e-4fd3-9ba6-718c02e116c2', v.continent, v.country
  FROM (VALUES
          ('Africa - general',               'Africa',        NULL::text),
          ('Green County CC',                'North America', 'United States'),
          ('Eastern Illinois University',    'North America', 'United States'),
          ('Mt. St. Joseph''s University',   'North America', 'United States'),
          ('Gem City Career Prep',           'North America', 'United States')
       ) AS v(name, continent, country)
  CROSS JOIN LATERAL (SELECT public.generate_join_code() AS code) c
 WHERE NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.name = v.name);

-- The official list
UPDATE public.organizations SET is_listed = (name IN (
  'Davidson AI Futures Lab', 'Maji Mazuri', 'Open Mind Africa', 'Africa - general', 'Green County CC',
  'University of Dayton', 'Back to Basics Youth Education', 'Eastern Illinois University',
  'Mt. St. Joseph''s University', 'Gem City Career Prep', 'UD-OLLI', 'US - general'));

-- The sign-up dropdown. Returns what the sign-up form needs, never a join code.
CREATE OR REPLACE FUNCTION public.list_joinable_organizations()
RETURNS TABLE(id uuid, name text, continent text, country text, state text, city text,
              learner_age_min integer, learner_age_max integer, learner_gender text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT o.id, o.name, o.continent, o.country, o.state, o.city, o.learner_age_min, o.learner_age_max, o.learner_gender::text
    FROM organizations o
   WHERE o.is_listed
   ORDER BY o.name;
$$;
REVOKE ALL ON FUNCTION public.list_joinable_organizations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_joinable_organizations() TO authenticated;

-- Only a platform administrator creates organizations now.
DROP POLICY IF EXISTS authenticated_users_can_create_org ON public.organizations;
