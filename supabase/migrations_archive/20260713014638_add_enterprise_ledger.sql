-- Youth Enterprise Ledger.
--
-- Context: the platform's stated goal of youth *creating their own
-- enterprises* is its thinnest part — EntrepreneurshipConsultantPage is
-- entirely about advising other people's businesses; nothing tracks a
-- youth's own venture over time. This adds a dead-simple ledger (what I
-- sold, to whom, for how much, this week) as both a livelihood tool and a
-- second, distinct impact stream, and wires it into the existing
-- evidence-linking mechanism for Community AI Challenges.

CREATE TABLE enterprise_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  enterprise_name text,
  item_or_service text not null,
  buyer_description text,
  amount numeric,
  unit text not null default 'NGN' CHECK (unit IN ('NGN','other')),
  entry_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

ALTER TABLE enterprise_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Learner manages own enterprise ledger" ON enterprise_ledger_entries
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all enterprise ledger entries" ON enterprise_ledger_entries
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('leader','platform_administrator')
  ));

-- Admin rollup — kept separate from community_impact_resolutions since a
-- logged sale isn't a "resolved consultation" and forcing it into that
-- vocabulary would dilute the existing resolution-rate metric.
CREATE VIEW enterprise_ledger_admin AS
SELECT e.*, p.organization_id, p.name AS learner_name
FROM enterprise_ledger_entries e
LEFT JOIN profiles p ON p.id = e.user_id;

-- Widen evidence-linking to accept enterprise entries as a 6th evidence
-- domain, so a logged sale can be attached to a Challenge/Grand Challenge
-- submission the same way a resolved consultation already can.
ALTER TABLE consultation_evidence_links DROP CONSTRAINT consultation_evidence_links_consultation_domain_check;
ALTER TABLE consultation_evidence_links ADD CONSTRAINT consultation_evidence_links_consultation_domain_check
  CHECK (consultation_domain IN ('agriculture','fishing','healthcare','entrepreneurship','animal_husbandry','enterprise'));
