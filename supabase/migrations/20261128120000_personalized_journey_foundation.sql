-- Foundation for the personalized learning journey (goals, pathway catalog, demand
-- ratings, shortlist). Phase 0 of the development plan: additive-only, nothing
-- learner-facing exists yet, no existing table/page/flow changes.
--
--   pathways                 the career/life pathway catalog (cluster, name,
--                             community impact, AI integration, curriculum status)
--   pathway_demand_ratings    Job Outlook (1-5) + Reach (local/global) per pathway,
--                             per region; starts as a rough estimate, replaced with
--                             sourced regional labor data over time (region column
--                             lets several regions coexist later without a redesign)
--   learner_goal_history      the learner's evolving career/life goal — append-only,
--                             so "how has this grown" is a readable story, not just
--                             a field that got overwritten
--   pathway_shortlist         candidate pathways a learner is exploring/committed to
--                             (Stage 4, "Choosing a Direction") — current state per
--                             learner per pathway, not a history
--
-- All four are server-managed reference/own-data tables: learners read the catalog
-- and demand ratings (authenticated, read-only — content is edited by staff, not
-- through the app) and read/write their own goal history and shortlist only, both
-- through functions so validation lives in one place rather than in RLS WITH CHECK
-- clauses (same pattern as request_data_action in data_requests.sql).

CREATE TABLE IF NOT EXISTS public.pathways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_key text NOT NULL CHECK (cluster_key IN (
    'tech', 'energy', 'health', 'agri', 'finance', 'education', 'civic', 'creative', 'trades'
  )),
  cluster_label text NOT NULL,
  name text NOT NULL,
  community_impact text NOT NULL,
  ai_integration text NOT NULL,
  curriculum_status text NOT NULL CHECK (curriculum_status IN ('live', 'foundation_exists', 'future')),
  curriculum_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cluster_key, name)
);
COMMENT ON TABLE public.pathways IS 'Career/life pathway catalog for the personalized learning journey. Read-only to learners; edited by staff, not through the app.';
COMMENT ON COLUMN public.pathways.curriculum_status IS 'live = a dedicated NextVillage module already covers this; foundation_exists = real foundation exists but no path-specific module; future = nothing built yet.';

CREATE TABLE IF NOT EXISTS public.pathway_demand_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pathway_id uuid NOT NULL REFERENCES public.pathways(id) ON DELETE CASCADE,
  region text NOT NULL DEFAULT 'rough_estimate_general',
  reach text NOT NULL CHECK (reach IN ('local', 'global')),
  outlook_score smallint NOT NULL CHECK (outlook_score BETWEEN 1 AND 5),
  rationale text,
  source text NOT NULL DEFAULT 'rough_estimate' CHECK (source IN ('rough_estimate', 'sourced')),
  source_detail text,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pathway_id, region)
);
COMMENT ON TABLE public.pathway_demand_ratings IS 'Job Outlook (1-5) and Reach (local/global) per pathway per region. region defaults to a single rough, unsourced estimate (source = rough_estimate); real regional rows (source = sourced) get added per the development plan without changing this schema.';

CREATE TABLE IF NOT EXISTS public.learner_goal_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  goal_text text NOT NULL CHECK (char_length(btrim(goal_text)) > 0 AND char_length(goal_text) <= 500),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'evolved', 'achieved', 'abandoned')),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.learner_goal_history IS 'Append-only history of a learner''s career/life goal. The most recent row for a user is their current goal; earlier rows are how it got there.';

CREATE TABLE IF NOT EXISTS public.pathway_shortlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pathway_id uuid NOT NULL REFERENCES public.pathways(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'exploring' CHECK (status IN ('exploring', 'committed', 'dropped')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, pathway_id)
);
COMMENT ON TABLE public.pathway_shortlist IS 'Pathways a learner is exploring or has committed to (Stage 4, Choosing a Direction). Current state per learner per pathway, not a history.';

CREATE OR REPLACE FUNCTION public.pathways_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS pathways_touch ON public.pathways;
CREATE TRIGGER pathways_touch BEFORE UPDATE ON public.pathways FOR EACH ROW EXECUTE FUNCTION public.pathways_touch();
REVOKE ALL ON FUNCTION public.pathways_touch() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pathway_shortlist_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS pathway_shortlist_touch ON public.pathway_shortlist;
CREATE TRIGGER pathway_shortlist_touch BEFORE UPDATE ON public.pathway_shortlist FOR EACH ROW EXECUTE FUNCTION public.pathway_shortlist_touch();
REVOKE ALL ON FUNCTION public.pathway_shortlist_touch() FROM PUBLIC, anon, authenticated;

-- Row Level Security -------------------------------------------------------

ALTER TABLE public.pathways ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pathway_demand_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_goal_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pathway_shortlist ENABLE ROW LEVEL SECURITY;

-- anon/authenticated get automatic grants on new tables, so revoke per role first.
REVOKE ALL ON public.pathways FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pathway_demand_ratings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.learner_goal_history FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pathway_shortlist FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.pathways TO authenticated;
GRANT SELECT ON public.pathway_demand_ratings TO authenticated;
GRANT SELECT ON public.learner_goal_history TO authenticated;
GRANT SELECT ON public.pathway_shortlist TO authenticated;
GRANT ALL ON public.pathways TO service_role;
GRANT ALL ON public.pathway_demand_ratings TO service_role;
GRANT ALL ON public.learner_goal_history TO service_role;
GRANT ALL ON public.pathway_shortlist TO service_role;

DROP POLICY IF EXISTS pathways_select ON public.pathways;
CREATE POLICY pathways_select ON public.pathways FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS pathway_demand_ratings_select ON public.pathway_demand_ratings;
CREATE POLICY pathway_demand_ratings_select ON public.pathway_demand_ratings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS own_goal_history ON public.learner_goal_history;
CREATE POLICY own_goal_history ON public.learner_goal_history FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS own_shortlist ON public.pathway_shortlist;
CREATE POLICY own_shortlist ON public.pathway_shortlist FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Learner-facing functions --------------------------------------------------

-- Record a new goal snapshot for the caller. Always inserts (append-only); the
-- latest row is the current goal. p_status describes why: 'active' on first set,
-- 'evolved' when it changed, 'achieved' / 'abandoned' to close one out.
CREATE OR REPLACE FUNCTION public.set_learner_goal(p_goal_text text, p_status text DEFAULT 'active', p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF p_status NOT IN ('active', 'evolved', 'achieved', 'abandoned') THEN
    RAISE EXCEPTION 'Unknown goal status';
  END IF;
  INSERT INTO learner_goal_history (user_id, goal_text, status, note)
  VALUES (auth.uid(), left(btrim(p_goal_text), 500), p_status, left(p_note, 500))
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_learner_goal(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_learner_goal(text, text, text) TO authenticated;

-- The caller's current goal (most recent row), or null if they have none yet.
CREATE OR REPLACE FUNCTION public.current_learner_goal()
RETURNS public.learner_goal_history
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM learner_goal_history
  WHERE user_id = auth.uid()
  ORDER BY created_at DESC
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.current_learner_goal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_learner_goal() TO authenticated;

-- Set the caller's status on one pathway (exploring / committed / dropped).
-- Upserts, since the shortlist is current state, not a history.
CREATE OR REPLACE FUNCTION public.set_pathway_shortlist_status(p_pathway_id uuid, p_status text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF p_status NOT IN ('exploring', 'committed', 'dropped') THEN
    RAISE EXCEPTION 'Unknown shortlist status';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pathways WHERE id = p_pathway_id) THEN
    RAISE EXCEPTION 'Unknown pathway';
  END IF;
  INSERT INTO pathway_shortlist (user_id, pathway_id, status)
  VALUES (auth.uid(), p_pathway_id, p_status)
  ON CONFLICT (user_id, pathway_id) DO UPDATE SET status = p_status
  RETURNING id INTO row_id;
  RETURN row_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_pathway_shortlist_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pathway_shortlist_status(uuid, text) TO authenticated;

-- The pathway catalog with its current (rough_estimate_general, for now) demand
-- rating folded in — the one query the mentoring UI needs for Stage 3 ("The Big
-- Picture") and Stage 4 ("Choosing a Direction").
CREATE OR REPLACE FUNCTION public.pathway_catalog()
RETURNS TABLE (
  id uuid, cluster_key text, cluster_label text, name text,
  community_impact text, ai_integration text,
  curriculum_status text, curriculum_note text,
  reach text, outlook_score smallint, outlook_rationale text, outlook_source text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.cluster_key, p.cluster_label, p.name,
         p.community_impact, p.ai_integration,
         p.curriculum_status, p.curriculum_note,
         r.reach, r.outlook_score, r.rationale, r.source
  FROM pathways p
  LEFT JOIN pathway_demand_ratings r
    ON r.pathway_id = p.id AND r.region = 'rough_estimate_general'
  ORDER BY p.cluster_key, p.name;
$$;
REVOKE ALL ON FUNCTION public.pathway_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pathway_catalog() TO authenticated;

-- Seed data: the 54-path catalog from the Pathways Catalog design artifact. -----

INSERT INTO public.pathways (cluster_key, cluster_label, name, community_impact, ai_integration, curriculum_status, curriculum_note) VALUES
('tech','Technology & AI','AI-Enabled Small Business Advisor','Helps shopkeepers and farmers adopt AI tools to grow their business.','Uses the same AI tools clients will use — in both training and practice.','live',NULL),
('tech','Technology & AI','AI Cybersecurity Specialist','Protects local institutions and businesses from digital threats.','Trains on AI-simulated attacks; practices with AI-powered threat detection.','foundation_exists','Security & Safety trainer covers fundamentals'),
('tech','Technology & AI','AI Workflow / Prompt Designer','Makes AI tools genuinely usable for non-technical local businesses.','Works hands-on with real AI tools in both training and practice.','foundation_exists','AI Ready Skills + AI Learning'),
('tech','Technology & AI','AI Data Curator / Annotator','Improves the training data behind AI models — real, globally available gig work.','Trains and works inside AI labeling platforms.','foundation_exists','AI Ready Skills'),
('tech','Technology & AI','Community AI Trainer / Educator','Teaches neighbors to use AI tools safely and well.','Learns the tools first, then teaches with them.','foundation_exists','AI Ready Skills / AI Learning is the skill base'),
('tech','Technology & AI','AI-Assisted Software / App Developer','Builds tools that solve real local problems.','AI pair-programming in both training and practice.','foundation_exists','Tech Skills / AI Ready Skills'),
('tech','Technology & AI','AI-Assisted Data / Research Analyst','Supports local decisions with real information.','Uses AI analysis tools in training and practice.','foundation_exists','Math/Science Foundations + AI Learning'),
('tech','Technology & AI','AI Agent Engineer ("Agentification" Specialist)','Builds AI agents that automate real workflows for local organizations.','Both training and practice are literally building and deploying agents.','future',NULL),
('tech','Technology & AI','AI Automation Technician','Installs and maintains AI-driven automation — invoicing, scheduling, inventory — for local businesses.','Practice is entirely AI tool deployment.','future',NULL),
('tech','Technology & AI','AI Model Customizer / Fine-Tuner','Adapts AI models to local language, crops, or business needs.','Builds and adjusts models in both training and practice.','future',NULL),
('tech','Technology & AI','AI Ethics & Safety Reviewer','Checks local AI tools and outputs for bias and safety.','Trains on evaluation methods; audits real tools in practice.','future',NULL),
('tech','Technology & AI','AI-Augmented IT / Network Technician','Keeps schools, clinics, and businesses connected.','Uses AI anomaly and network monitoring in practice.','future',NULL),
('tech','Technology & AI','AI Marketing & Social Media Specialist','Helps local businesses find customers and tell their story online.','Uses AI copywriting, image, and social-analytics tools in both training and practice.','future',NULL),
('tech','Technology & AI','Computer Repair Technician','Keeps the computers a community already has running, instead of discarded — e.g. the repair tools now going to Oloibiri.','AI-assisted fault diagnosis and guided repair walkthroughs in both training and practice.','future',NULL),
('energy','Energy, Infrastructure & Built Environment','Solar / Renewable Energy Technician','Brings power to homes, schools, and clinics that didn''t have it.','AI-assisted system design in training; AI-powered fault diagnosis and monitoring in practice.','live',NULL),
('energy','Energy, Infrastructure & Built Environment','Electrician','Safe wiring for homes and local businesses.','AI circuit-diagnostic tools in practice.','future',NULL),
('energy','Energy, Infrastructure & Built Environment','Water & Sanitation Technician','Clean water access for the whole community.','AI water-quality sensor analytics in practice.','future',NULL),
('energy','Energy, Infrastructure & Built Environment','Construction Trades (Mason, Carpenter)','Builds the housing and schools people rely on.','AI-assisted design and material estimating.','future',NULL),
('energy','Energy, Infrastructure & Built Environment','Infrastructure Maintenance Worker','Keeps shared community assets running.','AI predictive-maintenance alerts in practice.','future',NULL),
('health','Health & Wellbeing','Peer Mental Health Support Worker','Offers peer support where professional care is scarce.','Trains with AI role-play practice partners; AI stays a training aid, never a stand-in for human judgment in practice.','foundation_exists','Life-skill metrics + Together Learning build the peer-support base'),
('health','Health & Wellbeing','Community Health Worker','Frontline care where doctors are scarce.','Trains on AI-simulated patient scenarios; AI symptom-triage tools assist, decisions stay human.','future',NULL),
('health','Health & Wellbeing','Nurse / Clinical Worker','Extends quality care to more people in the community.','AI diagnostic-support tools; AI-based clinical training simulations.','future',NULL),
('health','Health & Wellbeing','Nutrition & Public Health Educator','Improves community health through better food and prevention habits.','AI-personalized nutrition guidance tools.','future',NULL),
('health','Health & Wellbeing','Caregiver (Elder / Disability Support)','Supports the most vulnerable members of the community with dignity.','AI monitoring and reminder tools for those they care for.','future',NULL),
('agri','Agriculture, Environment & Food Systems','Agribusiness Entrepreneur','Processes and sells local produce, creating jobs.','AI market-price and demand forecasting.','foundation_exists','Financial Literacy + AI Ready Skills'),
('agri','Agriculture, Environment & Food Systems','Food Storage / Distribution Worker','Reduces local waste and hunger.','AI demand forecasting cuts spoilage and waste.','foundation_exists','Financial Literacy'),
('agri','Agriculture, Environment & Food Systems','Climate-Smart Farmer','Feeds the community while improving the land.','AI weather and crop prediction; pest ID by photo in practice.','future',NULL),
('agri','Agriculture, Environment & Food Systems','Animal Health Worker','Protects the livestock many families depend on.','AI photo-based livestock disease screening.','future',NULL),
('agri','Agriculture, Environment & Food Systems','Environmental Conservation Worker','Protects shared water, forest, and soil.','AI satellite and sensor analysis of land health.','future',NULL),
('finance','Finance & Economic Development','Financial Literacy Coach','Helps neighbors budget, save, and avoid debt traps.','AI-personalized budgeting practice tools.','live',NULL),
('finance','Finance & Economic Development','Small Business Owner','Creates local jobs directly.','AI tools for marketing, inventory, and customer service.','live',NULL),
('finance','Finance & Economic Development','Bookkeeper / Accountant','Keeps local businesses financially healthy and honest.','AI-assisted reconciliation and bookkeeping tools.','foundation_exists','Financial Literacy + Math Foundations'),
('finance','Finance & Economic Development','Savings-Group / Microfinance Organizer','Builds shared financial resilience across a neighborhood.','AI tools tracking contributions and flagging risk.','foundation_exists','Financial Literacy'),
('finance','Finance & Economic Development','Cooperative / Credit Union Manager','Manages shared financial resources for the whole group''s benefit.','AI credit-risk and fraud-detection support.','foundation_exists','Financial Literacy base; no governance module yet'),
('education','Education & Mentoring','Teacher (Math / English / Science)','Multiplies learning across the whole community.','AI tutoring tools personalize instruction — what this platform already does.','live',NULL),
('education','Education & Mentoring','Peer Tutor / Mentor','Near-peer teaching, the same spirit as Together Learning.','AI practice partner for rehearsing explanations before teaching peers.','live',NULL),
('education','Education & Mentoring','Adult Literacy / Life Skills Facilitator','Helps adults build skills they missed earlier in life.','AI reading-level-adaptive materials.','foundation_exists','English Skills'),
('education','Education & Mentoring','Vocational Skills Trainer','Passes hands-on trade skills to the next generation.','AI-assisted skill assessment.','future',NULL),
('education','Education & Mentoring','Early Childhood Educator','Builds the foundation for a community''s youngest learners.','AI-assisted, carefully limited activity-content generation.','future',NULL),
('civic','Civic Leadership & Social Work','Peacebuilding / Conflict Resolution Worker','Helps a community resolve conflict without it turning destructive.','AI pattern-monitoring as a human-led input, never a decision-maker.','foundation_exists','Community Standards metric + Together Learning''s safety layer'),
('civic','Civic Leadership & Social Work','Community Organizer','Turns shared concerns into coordinated local action.','AI tools for mapping community needs and data.','future',NULL),
('civic','Civic Leadership & Social Work','NGO / Nonprofit Program Worker','Delivers programs that directly serve community needs.','AI-assisted impact reporting.','future',NULL),
('civic','Civic Leadership & Social Work','Local Government / Public Service Worker','Makes public services work better for everyone.','AI-assisted service-delivery tools.','future',NULL),
('civic','Civic Leadership & Social Work','Social Worker / Case Worker','Connects vulnerable community members to the support they need.','AI case-notes support, always human-reviewed.','future',NULL),
('creative','Creative, Communication & Culture','Local Journalist / Community Media Producer','Keeps people informed and connected.','AI research, transcription, and drafting assistance.','foundation_exists','English Skills'),
('creative','Creative, Communication & Culture','Writer / Storyteller','Preserves local history and culture.','AI drafting and editing assistant.','foundation_exists','English Skills'),
('creative','Creative, Communication & Culture','Translator / Local-Language Content Creator','Makes AI and information useful in local languages.','AI translation drafts, human-corrected — fixing AI''s blind spots in underserved languages.','foundation_exists','English Skills (one side of the language pair)'),
('creative','Creative, Communication & Culture','Designer','Helps local businesses market themselves.','AI image and design generation tools.','future',NULL),
('creative','Creative, Communication & Culture','Musician / Performing Artist','Sustains community culture and events.','AI music production and promotion tools.','future',NULL),
('trades','Trades, Manufacturing & Mechanical Work','Mechanic','Keeps transport and farm equipment running.','AI diagnostic scanning for vehicles and equipment.','future',NULL),
('trades','Trades, Manufacturing & Mechanical Work','Welder / Metalworker','Builds and repairs the metal structures a community depends on.','AI-assisted design and spec tools.','future',NULL),
('trades','Trades, Manufacturing & Mechanical Work','Electronics Repair Technician','Extends the life of phones and appliances, reducing waste.','AI-assisted fault diagnosis.','future',NULL),
('trades','Trades, Manufacturing & Mechanical Work','Tailor / Textile Producer','Clothes the community and creates local income.','AI pattern-generation tools.','future',NULL),
('trades','Trades, Manufacturing & Mechanical Work','Furniture / Woodworking Craftsperson','Builds practical, lasting goods for local homes and schools.','AI design and CAD assistance.','future',NULL)
ON CONFLICT (cluster_key, name) DO NOTHING;

INSERT INTO public.pathway_demand_ratings (pathway_id, reach, outlook_score, rationale, source)
SELECT p.id, v.reach, v.outlook_score, v.rationale, 'rough_estimate'
FROM (VALUES
  ('AI-Enabled Small Business Advisor','local',3,'Steady in-person consulting demand, grows slowly'),
  ('AI Cybersecurity Specialist','global',5,'Severe, well-documented global cybersecurity talent shortage'),
  ('AI Workflow / Prompt Designer','global',4,'Fast-growing but still-forming global job category'),
  ('AI Data Curator / Annotator','global',4,'Large real demand, but often low-paid gig work'),
  ('Community AI Trainer / Educator','local',3,'Large need, but few paid roles exist yet'),
  ('AI-Assisted Software / App Developer','global',5,'Proven, large African remote-developer talent pipeline'),
  ('AI-Assisted Data / Research Analyst','global',4,'Established remote-outsourcing category, steady growth'),
  ('AI Agent Engineer ("Agentification" Specialist)','global',5,'The fastest-growing area in AI right now'),
  ('AI Automation Technician','global',4,'Overlaps a growing global automation-consulting market'),
  ('AI Model Customizer / Fine-Tuner','global',3,'Real demand, but needs deeper specialized ML skill'),
  ('AI Ethics & Safety Reviewer','global',2,'Important, but few roles outside major AI labs'),
  ('AI-Augmented IT / Network Technician','local',3,'Steady locally; some remote network-support work too'),
  ('AI Marketing & Social Media Specialist','global',5,'One of the largest global freelance work categories'),
  ('Computer Repair Technician','local',4,'Extends device life and cuts the cost of access'),
  ('Solar / Renewable Energy Technician','local',5,'Booming off-grid solar sector across the region'),
  ('Electrician','local',5,'Power access is a widespread regional crisis'),
  ('Water & Sanitation Technician','local',4,'Persistent infrastructure gap, strong ongoing need'),
  ('Construction Trades (Mason, Carpenter)','local',4,'Tied to active urban housing growth'),
  ('Infrastructure Maintenance Worker','local',4,'Power and infrastructure gaps are widespread regionally'),
  ('Peer Mental Health Support Worker','local',3,'Growing, but mostly NGO-funded roles today'),
  ('Community Health Worker','local',5,'Chronic, well-documented regional health-worker shortage'),
  ('Nurse / Clinical Worker','local',5,'Severe local shortage, plus high global demand'),
  ('Nutrition & Public Health Educator','local',4,'Food insecurity and healthcare access are both pressing'),
  ('Caregiver (Elder / Disability Support)','local',3,'Rising need, often informal and underpaid'),
  ('Agribusiness Entrepreneur','local',4,'Directly addresses regional food insecurity and the jobs gap'),
  ('Food Storage / Distribution Worker','local',4,'Food insecurity makes this a pressing regional need'),
  ('Climate-Smart Farmer','local',5,'Climate crisis makes this urgent region-wide'),
  ('Animal Health Worker','local',4,'Ties directly to regional food security'),
  ('Environmental Conservation Worker','local',4,'Climate crisis is driving urgent regional investment'),
  ('Financial Literacy Coach','local',4,'Large unbanked population; strong fintech push'),
  ('Small Business Owner','local',4,'Directly addresses the regional employment-opportunity gap'),
  ('Bookkeeper / Accountant','local',3,'Steady as the formal business sector grows'),
  ('Savings-Group / Microfinance Organizer','local',3,'Well-established, widespread community model'),
  ('Cooperative / Credit Union Manager','local',3,'Steady, moderate volume of roles'),
  ('Teacher (Math / English / Science)','local',5,'Chronic, widely documented regional teacher shortage'),
  ('Peer Tutor / Mentor','local',3,'Valuable, but rarely a distinct paid job'),
  ('Adult Literacy / Life Skills Facilitator','local',3,'Steady, mostly program- and NGO-funded'),
  ('Vocational Skills Trainer','local',4,'Rising with government TVET investment'),
  ('Early Childhood Educator','local',3,'Growing as early-childhood investment increases'),
  ('Peacebuilding / Conflict Resolution Worker','local',3,'Real need, but funding-dependent and uneven'),
  ('Community Organizer','local',2,'Valuable, but rarely a paid role'),
  ('NGO / Nonprofit Program Worker','local',4,'Large regional NGO sector, steady hiring'),
  ('Local Government / Public Service Worker','local',3,'Steady, limited by public hiring capacity'),
  ('Social Worker / Case Worker','local',3,'Growing need, often underfunded'),
  ('Local Journalist / Community Media Producer','local',3,'Small local market; some digital growth'),
  ('Writer / Storyteller','global',3,'Competitive, but a real global freelance market'),
  ('Translator / Local-Language Content Creator','global',4,'Underserved languages are a genuine niche need'),
  ('Designer','global',4,'Established global freelance demand for digital design'),
  ('Musician / Performing Artist','local',2,'Highly variable, hard to count on'),
  ('Mechanic','local',4,'Steady, rising with vehicle ownership'),
  ('Welder / Metalworker','local',3,'Steady, tied to construction activity'),
  ('Electronics Repair Technician','local',4,'Growing with rising device ownership'),
  ('Tailor / Textile Producer','local',3,'Steady but competitive in many cities'),
  ('Furniture / Woodworking Craftsperson','local',3,'Steady, moderate local demand')
) AS v(name, reach, outlook_score, rationale)
JOIN public.pathways p ON p.name = v.name
ON CONFLICT (pathway_id, region) DO NOTHING;
