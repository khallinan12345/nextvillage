-- One agreed definition for the headline numbers shown publicly.
--
-- Before this, "51 learners", "140" and "87 certifications" came from three
-- different places with three different meanings:
--   140  = every profile in the Davidson AI Futures Lab organization, staff included
--   51   = distinct learner tokens with a non-suppressed dashboard_stats row
--          (tokens can't be matched back to users, so staff can't be filtered out)
--   87   = certificates counted in dashboard_stats, whose snapshots stop in July 2026
--
-- This function returns all of them side by side, staff excluded from every
-- learner count, with certificates counted live from the dashboard table and
-- split by type. It returns aggregates only.

CREATE OR REPLACE FUNCTION public.get_headline_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH site_orgs AS (
    -- The main lab plus the misspelled/duplicate organization rows created
    -- during onboarding.
    SELECT id FROM organizations
    WHERE id IN (
      'a1b2c3d4-0001-0001-0001-000000000001',
      '00bd2a68-7ae4-4e70-82de-455e865a9a48',
      '85f12740-d3bf-4f50-b36b-15dc4428bd08',
      '545d286d-2045-4792-92e5-f2fbec2e895e',
      '089cc033-e2c6-4227-b87f-9e27692c57d6'
    )
  ),
  site_profiles AS (
    SELECT p.id, p.role, p.membership_status
    FROM profiles p
    WHERE p.organization_id IN (SELECT id FROM site_orgs)
       OR (p.organization_id IS NULL AND p.city ILIKE 'oloibiri%')
  ),
  enrolled AS (
    SELECT id FROM site_profiles
    WHERE role IN ('student', 'learner') AND membership_status = 'approved'
  ),
  months AS (
    -- Calendar months in which the learner had at least one session. Counted
    -- from user_monthly_assessments (joins to profiles by user id) rather than
    -- dashboard_stats, whose learner tokens are hashed one-way and cannot be
    -- matched back to staff vs learner.
    SELECT uma.user_id, COUNT(DISTINCT date_trunc('month', uma.measured_at)) AS n_months
    FROM user_monthly_assessments uma
    WHERE uma.session_count > 0
      AND uma.user_id IN (SELECT id FROM enrolled)
    GROUP BY uma.user_id
  ),
  certs AS (
    SELECT d.user_id,
           CASE WHEN COUNT(*) OVER (PARTITION BY d.activity) < 3
                THEN 'Other specialist certifications'
                ELSE d.activity END AS cert_type
    FROM dashboard d
    WHERE d.certificate_pdf_url IS NOT NULL
      AND d.user_id IN (SELECT id FROM enrolled)
  ),
  cert_types AS (
    SELECT cert_type, COUNT(*) AS n FROM certs GROUP BY cert_type
  )
  SELECT jsonb_build_object(
    'as_of', CURRENT_DATE,
    'all_accounts_incl_staff', (SELECT COUNT(*) FROM site_profiles),
    'staff_accounts', (SELECT COUNT(*) FROM site_profiles
                       WHERE role NOT IN ('student', 'learner')),
    'enrolled_learners', (SELECT COUNT(*) FROM enrolled),
    'active_learners', (SELECT COUNT(*) FROM months),
    'persistent_learners', (SELECT COUNT(*) FROM months WHERE n_months >= 3),
    'certifications_total', (SELECT COUNT(*) FROM certs),
    'learners_certified', (SELECT COUNT(DISTINCT user_id) FROM certs),
    'certifications_by_type', COALESCE(
      (SELECT jsonb_object_agg(cert_type, n ORDER BY n DESC) FROM cert_types),
      '{}'::jsonb)
  );
$$;

-- anon/authenticated are auto-granted on new functions here, so revoke per role
-- and grant back explicitly: the public landing page needs to call this.
REVOKE ALL ON FUNCTION public.get_headline_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_headline_stats() TO anon, authenticated, service_role;
