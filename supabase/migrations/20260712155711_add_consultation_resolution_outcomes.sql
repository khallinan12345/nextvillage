-- Structured resolution-outcome tracking for community-impact consultations.
--
-- Context: these 5 tables (agriculture_consultations, fishing_consultations,
-- health_assessments, entrepreneurship_consultations,
-- animal_husbandry_consultations) were created ad hoc directly against the
-- live database and were never tracked in migrations. This migration is
-- intentionally scoped to ONLY the new columns/policies/view being added now
-- — it does not attempt to redefine or recreate the existing schema.
--
-- Today, "resolving" a consultation is a single boolean toggle with no
-- capture of what actually happened. This adds a structured outcome (was
-- the advice applied?, what happened, and an estimated value) captured at
-- resolution time, plus a unified view + admin-read RLS policy so this can
-- be rolled up into a community-level impact summary.

-- ── 1. Resolution-outcome columns (identical shape on all 5 tables) ────────

ALTER TABLE agriculture_consultations
  ADD COLUMN IF NOT EXISTS resolution_outcome text CHECK (resolution_outcome IN ('applied','partially_applied','not_applied')),
  ADD COLUMN IF NOT EXISTS resolution_narrative text,
  ADD COLUMN IF NOT EXISTS resolution_value_amount numeric,
  ADD COLUMN IF NOT EXISTS resolution_value_unit text CHECK (resolution_value_unit IN ('NGN','kg','days_averted','animals_saved','other')),
  ADD COLUMN IF NOT EXISTS resolution_value_label text;

ALTER TABLE fishing_consultations
  ADD COLUMN IF NOT EXISTS resolution_outcome text CHECK (resolution_outcome IN ('applied','partially_applied','not_applied')),
  ADD COLUMN IF NOT EXISTS resolution_narrative text,
  ADD COLUMN IF NOT EXISTS resolution_value_amount numeric,
  ADD COLUMN IF NOT EXISTS resolution_value_unit text CHECK (resolution_value_unit IN ('NGN','kg','days_averted','animals_saved','other')),
  ADD COLUMN IF NOT EXISTS resolution_value_label text;

ALTER TABLE health_assessments
  ADD COLUMN IF NOT EXISTS resolution_outcome text CHECK (resolution_outcome IN ('applied','partially_applied','not_applied')),
  ADD COLUMN IF NOT EXISTS resolution_narrative text,
  ADD COLUMN IF NOT EXISTS resolution_value_amount numeric,
  ADD COLUMN IF NOT EXISTS resolution_value_unit text CHECK (resolution_value_unit IN ('NGN','kg','days_averted','animals_saved','other')),
  ADD COLUMN IF NOT EXISTS resolution_value_label text;

ALTER TABLE entrepreneurship_consultations
  ADD COLUMN IF NOT EXISTS resolution_outcome text CHECK (resolution_outcome IN ('applied','partially_applied','not_applied')),
  ADD COLUMN IF NOT EXISTS resolution_narrative text,
  ADD COLUMN IF NOT EXISTS resolution_value_amount numeric,
  ADD COLUMN IF NOT EXISTS resolution_value_unit text CHECK (resolution_value_unit IN ('NGN','kg','days_averted','animals_saved','other')),
  ADD COLUMN IF NOT EXISTS resolution_value_label text;

ALTER TABLE animal_husbandry_consultations
  ADD COLUMN IF NOT EXISTS resolution_outcome text CHECK (resolution_outcome IN ('applied','partially_applied','not_applied')),
  ADD COLUMN IF NOT EXISTS resolution_narrative text,
  ADD COLUMN IF NOT EXISTS resolution_value_amount numeric,
  ADD COLUMN IF NOT EXISTS resolution_value_unit text CHECK (resolution_value_unit IN ('NGN','kg','days_averted','animals_saved','other')),
  ADD COLUMN IF NOT EXISTS resolution_value_label text;

-- ── 2. Admin/leader read-all policy (additive — existing own-rows SELECT
--       policies are untouched; Postgres OR's multiple permissive policies
--       for the same command together) ─────────────────────────────────────

CREATE POLICY "Admins can view all agriculture consultations" ON agriculture_consultations
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('leader','platform_administrator')
  ));

CREATE POLICY "Admins can view all fishing consultations" ON fishing_consultations
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('leader','platform_administrator')
  ));

CREATE POLICY "Admins can view all health assessments" ON health_assessments
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('leader','platform_administrator')
  ));

CREATE POLICY "Admins can view all entrepreneurship consultations" ON entrepreneurship_consultations
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('leader','platform_administrator')
  ));

CREATE POLICY "Admins can view all animal husbandry consultations" ON animal_husbandry_consultations
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('leader','platform_administrator')
  ));

-- ── 3. Unified rollup view across all 5 domains ─────────────────────────────

CREATE OR REPLACE VIEW community_impact_resolutions AS
SELECT
  'agriculture'::text AS domain,
  c.id, c.youth_user_id, p.organization_id, p.city,
  c.resolved, c.resolution_outcome, c.resolution_value_amount, c.resolution_value_unit,
  c.resolution_value_label, c.created_at, c.resolved_at
FROM agriculture_consultations c
LEFT JOIN profiles p ON p.id = c.youth_user_id

UNION ALL

SELECT
  'fishing'::text AS domain,
  c.id, c.youth_user_id, p.organization_id, p.city,
  c.resolved, c.resolution_outcome, c.resolution_value_amount, c.resolution_value_unit,
  c.resolution_value_label, c.created_at, c.resolved_at
FROM fishing_consultations c
LEFT JOIN profiles p ON p.id = c.youth_user_id

UNION ALL

SELECT
  'healthcare'::text AS domain,
  c.id, c.youth_user_id, p.organization_id, p.city,
  c.resolved, c.resolution_outcome, c.resolution_value_amount, c.resolution_value_unit,
  c.resolution_value_label, c.created_at, c.resolved_at
FROM health_assessments c
LEFT JOIN profiles p ON p.id = c.youth_user_id

UNION ALL

SELECT
  'entrepreneurship'::text AS domain,
  c.id, c.youth_user_id, p.organization_id, p.city,
  c.resolved, c.resolution_outcome, c.resolution_value_amount, c.resolution_value_unit,
  c.resolution_value_label, c.created_at, c.resolved_at
FROM entrepreneurship_consultations c
LEFT JOIN profiles p ON p.id = c.youth_user_id

UNION ALL

SELECT
  'animal_husbandry'::text AS domain,
  c.id, c.youth_user_id, p.organization_id, p.city,
  c.resolved, c.resolution_outcome, c.resolution_value_amount, c.resolution_value_unit,
  c.resolution_value_label, c.created_at, c.resolved_at
FROM animal_husbandry_consultations c
LEFT JOIN profiles p ON p.id = c.youth_user_id;
