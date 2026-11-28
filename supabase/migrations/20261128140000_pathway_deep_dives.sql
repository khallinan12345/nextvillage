-- Stage 5, "Guided Deep-Dive": one row per pathway with what the work looks
-- like, the core skills it needs, how it connects to curriculum, and the one
-- concrete next step into the app. AI drafts it first (status = ai_drafted);
-- a human reviews and edits before it ever reaches a learner (status =
-- published is the only status a learner can see). Starting with the 6
-- "Live now" paths only, per the development plan — the rest wait for real
-- Stage-4 shortlist data to show which are worth writing next.

CREATE TABLE IF NOT EXISTS public.pathway_deep_dives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pathway_id uuid NOT NULL UNIQUE REFERENCES public.pathways(id) ON DELETE CASCADE,
  day_in_the_work text,
  core_skills text[] NOT NULL DEFAULT '{}',
  curriculum_connection text,
  next_step_label text,
  next_step_path text,
  status text NOT NULL DEFAULT 'ai_drafted' CHECK (status IN ('ai_drafted', 'reviewed', 'published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.pathway_deep_dives IS 'Stage 5 guided deep-dive content per pathway. AI-drafted first, then reviewed and edited by staff; only status = published is ever shown to a learner.';

CREATE OR REPLACE FUNCTION public.pathway_deep_dives_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS pathway_deep_dives_touch ON public.pathway_deep_dives;
CREATE TRIGGER pathway_deep_dives_touch BEFORE UPDATE ON public.pathway_deep_dives FOR EACH ROW EXECUTE FUNCTION public.pathway_deep_dives_touch();
REVOKE ALL ON FUNCTION public.pathway_deep_dives_touch() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.pathway_deep_dives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pathway_deep_dives FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pathway_deep_dives TO authenticated;
GRANT ALL ON public.pathway_deep_dives TO service_role;

-- is_platform_team() already exists (platform_administrator / research_lead /
-- site_administrator) — reused here rather than duplicating that role check.
DROP POLICY IF EXISTS pathway_deep_dives_select ON public.pathway_deep_dives;
CREATE POLICY pathway_deep_dives_select ON public.pathway_deep_dives
  FOR SELECT TO authenticated
  USING (status = 'published' OR public.is_platform_team());

-- AI-drafted content for the 6 "Live now" paths. Not published yet — Kevin
-- reviews and edits these before any learner can see them.
INSERT INTO public.pathway_deep_dives (pathway_id, day_in_the_work, core_skills, curriculum_connection, next_step_label, next_step_path, status)
SELECT p.id, v.day_in_the_work, v.core_skills, v.curriculum_connection, v.next_step_label, v.next_step_path, 'ai_drafted'
FROM (VALUES
  (
    'Solar / Renewable Energy Technician',
    'Most days start by visiting a home, school, or clinic that needs solar power installed or repaired. You inspect the site, figure out how many panels and batteries it needs, then install and wire the system safely. On a repair day, you track down why a system stopped charging or an inverter failed, often with a multimeter and a checklist. You explain to the owner how to use and maintain what you built.',
    ARRAY['Reading and following wiring diagrams safely', 'Sizing a solar system to match what a building actually needs', 'Basic electrical troubleshooting with a multimeter', 'Explaining technical choices in plain language to a non-technical owner', 'Keeping a jobsite safe'],
    'Start with the Solar Engineering module on NextVillage — it covers system design and the AI-assisted diagnostic approach this path actually uses in practice.',
    'Start the Solar Engineering module',
    '/learning/solar-engineering'
  ),
  (
    'Financial Literacy Coach',
    'You sit down with people one at a time or in small groups — a shopkeeper, a parent, a young person starting their first job — and look at what''s actually coming in and going out each month. You help them build a simple budget, spot where a debt trap is forming before it closes, and set one realistic savings goal. Much of the job is just asking good questions and listening.',
    ARRAY['Building a simple personal or small-business budget', 'Explaining interest, debt, and savings in plain terms', 'Listening without judgment to someone''s real financial situation', 'Setting one realistic, specific goal instead of a vague one', 'Basic use of AI budgeting tools to personalize advice'],
    'Start with the Financial Literacy module — it''s the direct foundation for this path, covering budgeting, debt, and savings the way you''d coach someone else through them.',
    'Start the Financial Literacy module',
    '/learning/financial-literacy'
  ),
  (
    'Small Business Owner',
    'No single day looks the same. You might spend a morning buying stock or ingredients, an afternoon serving customers or making product, and an evening doing simple bookkeeping or posting on social media to bring in the next day''s customers. You''re constantly deciding what to spend on, what to charge, and what to fix first when something goes wrong.',
    ARRAY['Basic bookkeeping — knowing what you spent, earned, and owe', 'Pricing a product or service so it actually makes money', 'Customer service under pressure', 'Using AI tools for marketing, inventory, or scheduling', 'Deciding what to fix first when everything feels urgent'],
    'Financial Literacy gives you the money fundamentals; AI Ready Skills gives you the problem-solving and AI-tool fluency to run things efficiently. Both together are the real foundation here.',
    'Start the Financial Literacy module',
    '/learning/financial-literacy'
  ),
  (
    'AI-Enabled Small Business Advisor',
    'You visit local shopkeepers, farmers, or small manufacturers and look at one real problem they have — slow sales, messy bookkeeping, no way to reach new customers — then show them a specific AI tool that helps with exactly that, and help them actually start using it. You''re part teacher, part tech support, part business coach.',
    ARRAY['Diagnosing which part of a business is actually struggling', 'Matching a real AI tool to a real, specific problem (not AI for its own sake)', 'Teaching a busy, non-technical adult a new tool patiently', 'Basic small-business finance, so your advice is grounded', 'Following up to see if the advice actually worked'],
    'AI Ready Skills builds the AI-tool fluency and problem-solving this role runs on; Financial Literacy gives you the business grounding to advise well.',
    'Start the AI Ready Skills module',
    '/learning/skills'
  ),
  (
    'Teacher (Math / English / Science)',
    'You plan a lesson, teach it to a group of learners at different levels, and adjust on the spot when half the room gets it and half doesn''t. You check understanding constantly — not just at test time — and you spend real time on learners who are stuck, without leaving the rest bored. A lot of the job happens outside class: grading, planning tomorrow, and noticing which learner needs a different kind of encouragement.',
    ARRAY['Explaining one idea in several different ways until it lands', 'Reading a room to tell who is actually following along', 'Patience with repeated mistakes', 'Using AI tutoring tools to personalize practice for different levels', 'Planning a lesson that still works when it doesn''t go as planned'],
    'The Math, English, and Science Foundations modules on NextVillage are themselves a working model of how AI-personalized teaching works — studying them is also practicing the method.',
    'Start a Foundations module',
    '/math-skills'
  ),
  (
    'Peer Tutor / Mentor',
    'You sit with another learner, usually someone a bit behind you in one subject, and help them work through what''s confusing them — not by giving the answer, but by asking the question that gets them unstuck themselves. You''re patient with the same mistake showing up twice, and you notice when encouragement matters more than correction.',
    ARRAY['Asking a guiding question instead of giving the answer', 'Explaining the same idea a second way when the first doesn''t land', 'Noticing frustration before it becomes giving up', 'Giving specific, kind feedback', 'Practicing explanations with an AI partner before teaching a real peer'],
    'Together Learning is where this already happens on NextVillage — the same spirit of peer support, now named as a real path.',
    'Go to Together Learning',
    '/playground/together'
  )
) AS v(name, day_in_the_work, core_skills, curriculum_connection, next_step_label, next_step_path)
JOIN public.pathways p ON p.name = v.name
ON CONFLICT (pathway_id) DO NOTHING;
