-- Evidence-linking: lets a learner attach their own resolved consultations as
-- evidence to a weekly Community AI Challenge reflection or a Grand Challenge
-- quarterly journal, instead of re-describing the same work as free text in
-- three disconnected places. Evaluators (evaluate-challenge-submission,
-- evaluate-grand-challenge) read these links and weigh verified evidence
-- heavily alongside the learner's written reflection.

CREATE TABLE consultation_evidence_links (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references profiles(id),
  source_type text not null CHECK (source_type IN ('challenge_enrollment','grand_challenge_submission')),
  source_id uuid not null,
  consultation_domain text not null CHECK (consultation_domain IN ('agriculture','fishing','healthcare','entrepreneurship','animal_husbandry')),
  consultation_id uuid not null,
  created_at timestamptz not null default now(),
  UNIQUE (source_type, source_id, consultation_domain, consultation_id)
);

ALTER TABLE consultation_evidence_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Learner manages own evidence links" ON consultation_evidence_links
  FOR ALL
  USING (learner_id = auth.uid())
  WITH CHECK (learner_id = auth.uid());

CREATE POLICY "Admins can view all evidence links" ON consultation_evidence_links
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('leader','platform_administrator')
  ));

-- Extend the part-1 rollup view with a normalized summary_text column per
-- domain, so the evidence picker has something readable to show.
DROP VIEW IF EXISTS community_impact_resolutions;
CREATE VIEW community_impact_resolutions AS
SELECT
  'agriculture'::text AS domain,
  c.id, c.youth_user_id, p.organization_id, p.city,
  c.resolved, c.resolution_outcome, c.resolution_value_amount, c.resolution_value_unit,
  c.resolution_value_label, c.created_at, c.resolved_at,
  c.problem_summary AS summary_text
FROM agriculture_consultations c
LEFT JOIN profiles p ON p.id = c.youth_user_id

UNION ALL

SELECT
  'fishing'::text AS domain,
  c.id, c.youth_user_id, p.organization_id, p.city,
  c.resolved, c.resolution_outcome, c.resolution_value_amount, c.resolution_value_unit,
  c.resolution_value_label, c.created_at, c.resolved_at,
  c.problem_summary AS summary_text
FROM fishing_consultations c
LEFT JOIN profiles p ON p.id = c.youth_user_id

UNION ALL

SELECT
  'healthcare'::text AS domain,
  c.id, c.youth_user_id, p.organization_id, p.city,
  c.resolved, c.resolution_outcome, c.resolution_value_amount, c.resolution_value_unit,
  c.resolution_value_label, c.created_at, c.resolved_at,
  c.ai_triage_summary AS summary_text
FROM health_assessments c
LEFT JOIN profiles p ON p.id = c.youth_user_id

UNION ALL

SELECT
  'entrepreneurship'::text AS domain,
  c.id, c.youth_user_id, p.organization_id, p.city,
  c.resolved, c.resolution_outcome, c.resolution_value_amount, c.resolution_value_unit,
  c.resolution_value_label, c.created_at, c.resolved_at,
  c.problem_summary AS summary_text
FROM entrepreneurship_consultations c
LEFT JOIN profiles p ON p.id = c.youth_user_id

UNION ALL

SELECT
  'animal_husbandry'::text AS domain,
  c.id, c.youth_user_id, p.organization_id, p.city,
  c.resolved, c.resolution_outcome, c.resolution_value_amount, c.resolution_value_unit,
  c.resolution_value_label, c.created_at, c.resolved_at,
  c.symptom_summary AS summary_text
FROM animal_husbandry_consultations c
LEFT JOIN profiles p ON p.id = c.youth_user_id;
