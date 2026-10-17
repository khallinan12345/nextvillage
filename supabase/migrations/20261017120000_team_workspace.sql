-- Team workspace: change proposals, team tasks and a review schedule, for leaders and the platform
-- team (page: /team). Nothing here holds learner data.
--
-- Who can do what
--   "Team member"   = leader, site_leader, research_lead, platform_administrator.
--   "Platform team" = research_lead, platform_administrator.
-- Every row has an audience: 'all_leaders' (any team member can read it) or 'platform_team' (only the
-- platform team). Team members can add rows; the platform team can change or remove any row; a person
-- can change what they created (a proposal only while it is still 'proposed').

CREATE OR REPLACE FUNCTION public.is_team_member()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                  AND p.role::text IN ('platform_administrator', 'research_lead', 'site_leader', 'leader'));
$$;

CREATE OR REPLACE FUNCTION public.is_platform_team()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                  AND p.role::text IN ('platform_administrator', 'research_lead'));
$$;

REVOKE ALL ON FUNCTION public.is_team_member() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_platform_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_team_member() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_team() TO authenticated;

-- ── Change proposals (see docs/CHANGE-PROCESS.md) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.change_proposals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  problem          text NOT NULL,
  who_affected     text,
  evidence         text,
  smallest_change  text,
  cost_effort      text,
  success_measure  text,
  touches_children boolean NOT NULL DEFAULT false,
  tier             text NOT NULL DEFAULT 'A' CHECK (tier IN ('A', 'B', 'C')),
  status           text NOT NULL DEFAULT 'proposed'
                   CHECK (status IN ('proposed', 'candidate', 'not_now', 'approved', 'building', 'released', 'checked')),
  decision_note    text,
  audience         text NOT NULL DEFAULT 'all_leaders' CHECK (audience IN ('all_leaders', 'platform_team')),
  created_by       uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Team tasks ─────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  details     text,
  area        text NOT NULL DEFAULT 'general'
              CHECK (area IN ('general', 'safeguarding', 'privacy', 'security', 'learning', 'partners', 'oloibiri', 'funding')),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'doing', 'done')),
  owner_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date    date,
  doc_path    text,
  audience    text NOT NULL DEFAULT 'all_leaders' CHECK (audience IN ('all_leaders', 'platform_team')),
  created_by  uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  done_at     timestamptz
);

-- ── Review schedule ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.review_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  description      text,
  doc_path         text,
  cadence_days     integer NOT NULL CHECK (cadence_days BETWEEN 7 AND 1100),
  last_reviewed_at timestamptz,
  last_reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  audience         text NOT NULL DEFAULT 'all_leaders' CHECK (audience IN ('all_leaders', 'platform_team')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.review_log (
  id          bigserial PRIMARY KEY,
  item_id     uuid NOT NULL REFERENCES public.review_items(id) ON DELETE CASCADE,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  note        text
);

-- Row level security -------------------------------------------------------------------------
ALTER TABLE public.change_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_tasks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_log       ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.change_proposals, public.team_tasks, public.review_items, public.review_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.review_log_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.change_proposals, public.team_tasks TO authenticated;
GRANT SELECT ON public.review_items, public.review_log TO authenticated;

-- change_proposals
CREATE POLICY cp_select ON public.change_proposals FOR SELECT TO authenticated
  USING (public.is_platform_team() OR (audience = 'all_leaders' AND public.is_team_member()));
CREATE POLICY cp_insert ON public.change_proposals FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member() AND created_by = auth.uid() AND status = 'proposed'
              AND (audience = 'all_leaders' OR public.is_platform_team()));
CREATE POLICY cp_update ON public.change_proposals FOR UPDATE TO authenticated
  USING (public.is_platform_team() OR (created_by = auth.uid() AND status = 'proposed'))
  WITH CHECK (public.is_platform_team() OR (created_by = auth.uid() AND status = 'proposed'));
CREATE POLICY cp_delete ON public.change_proposals FOR DELETE TO authenticated
  USING (public.is_platform_team());

-- team_tasks
CREATE POLICY tt_select ON public.team_tasks FOR SELECT TO authenticated
  USING (public.is_platform_team() OR (audience = 'all_leaders' AND public.is_team_member()));
CREATE POLICY tt_insert ON public.team_tasks FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member() AND created_by = auth.uid()
              AND (audience = 'all_leaders' OR public.is_platform_team()));
CREATE POLICY tt_update ON public.team_tasks FOR UPDATE TO authenticated
  USING (public.is_platform_team() OR created_by = auth.uid() OR owner_id = auth.uid())
  WITH CHECK (public.is_platform_team() OR ((created_by = auth.uid() OR owner_id = auth.uid()) AND audience = 'all_leaders'));
CREATE POLICY tt_delete ON public.team_tasks FOR DELETE TO authenticated
  USING (public.is_platform_team());

-- review_items and review_log: read only; changes go through mark_reviewed() and the platform team
CREATE POLICY ri_select ON public.review_items FOR SELECT TO authenticated
  USING (public.is_platform_team() OR (audience = 'all_leaders' AND public.is_team_member()));
CREATE POLICY rl_select ON public.review_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.review_items r WHERE r.id = item_id));

-- Mark an item reviewed now. Any team member may do it for an item shared with all leaders; only the
-- platform team for platform-team items. The log records who did it and why.
CREATE OR REPLACE FUNCTION public.mark_reviewed(p_id uuid, p_note text DEFAULT NULL)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  it review_items%ROWTYPE;
  ts timestamptz := now();
BEGIN
  SELECT * INTO it FROM review_items WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review item not found'; END IF;
  IF NOT (public.is_platform_team() OR (it.audience = 'all_leaders' AND public.is_team_member())) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE review_items SET last_reviewed_at = ts, last_reviewed_by = auth.uid() WHERE id = p_id;
  INSERT INTO review_log(item_id, reviewed_by, reviewed_at, note) VALUES (p_id, auth.uid(), ts, left(p_note, 1000));
  RETURN ts;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_reviewed(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_reviewed(uuid, text) TO authenticated;

-- Keep updated_at honest on proposals
CREATE OR REPLACE FUNCTION public.touch_change_proposal() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.touch_change_proposal() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_touch_change_proposal BEFORE UPDATE ON public.change_proposals
  FOR EACH ROW EXECUTE FUNCTION public.touch_change_proposal();

-- Seed the review schedule. last_reviewed_at is left empty for items still waiting for their first
-- adoption review, so they show as due.
INSERT INTO public.review_items (title, description, doc_path, cadence_days, last_reviewed_at, audience) VALUES
 ('Child safeguarding policy', 'Review the policy, response times and what happened in any incident since the last review.', 'docs/CHILD-SAFEGUARDING-POLICY.md', 365, NULL, 'all_leaders'),
 ('Local contact numbers (Schedule A)', 'Ring each number: police, social welfare, clinic, helpline, child-protection contact. Update the table.', 'docs/CHILD-SAFEGUARDING-POLICY.md', 182, NULL, 'all_leaders'),
 ('Leader training and sign-offs', 'Check every current leader has trained and signed within the last year; refresh the training.', 'docs/LEADER-TRAINING.md', 365, NULL, 'all_leaders'),
 ('Code of conduct signed by every leader and volunteer', 'Collect signatures from anyone new; confirm copies are kept with the child-protection lead.', 'docs/templates/CODE-OF-CONDUCT.md', 365, NULL, 'all_leaders'),
 ('Quarterly roadmap review', 'Look at the decision log and the proposal list; decide what to start, stop or continue.', 'docs/CHANGE-PROCESS.md', 90, '2026-10-17', 'all_leaders'),
 ('Decision log', 'Check every recent decision is written down with its reason.', 'docs/DECISION-LOG.md', 90, '2026-10-17', 'all_leaders'),
 ('How students are evaluated: open items', 'Work through section 10; compare AI scores with teachers'' marks.', 'docs/STUDENT-EVALUATION.md', 90, '2026-10-17', 'platform_team'),
 ('AI safety checker test', 'Send test messages, confirm alert emails reach leaders and the fallback inbox, check the event log.', 'docs/AI-SAFETY-AND-GUARDRAILS.md', 90, NULL, 'platform_team'),
 ('Privacy notice against the data map', 'Confirm the public notice still matches what the platform does.', 'docs/DATA-MAP.md', 182, '2026-10-17', 'platform_team'),
 ('Vendors: terms and data processing agreements', 'Check each AI and hosting vendor''s terms; file dated copies of agreements.', 'docs/VENDOR-REVIEW.md', 365, NULL, 'platform_team'),
 ('Data protection impact assessment', 'Re-read the assessment after any new data use or country.', 'docs/DPIA.md', 365, '2026-10-17', 'platform_team'),
 ('Legal review of privacy and child-protection law', 'Nigeria, Kenya, Ghana and the US: check for changes; confirm the lawyer''s advice is applied.', 'docs/LEGAL-REVIEW-BRIEF.md', 365, NULL, 'platform_team'),
 ('Continuity drill and who-holds-which-login', 'A backup holder signs in to a system; a test alert is answered; the sheet is updated.', NULL, 182, NULL, 'platform_team'),
 ('Security findings', 'Code scanning, dependency alerts and the advisor''s notes: fix or dismiss with a reason.', 'docs/SECURITY-PROGRAM.md', 30, '2026-10-17', 'platform_team'),
 ('AI costs and budget', 'Compare the cost log with each partner''s agreed ceiling.', NULL, 30, '2026-10-17', 'platform_team'),
 ('Impact summary figures', 'Refresh the figures and the cautions before funder conversations.', 'docs/IMPACT-SUMMARY.md', 90, '2026-10-17', 'platform_team');
