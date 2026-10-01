-- Solar Engineering & Installation: training + certification
-- 1) Reuses the generic jsonb score store on dashboard (added by the
--    Financial Literacy migration) — no new column needed.
-- 2) Six certification assessments (one per area in src/lib/solarEngineering.ts)
-- 3) Starter practice modules (two per area), visible to every organization
--
-- assessment_name and learning_modules.sub_category MUST match the
-- `subCategory` strings in src/lib/solarEngineering.ts exactly.

begin;

-- ── 1. Certification assessments ─────────────────────────────────────────────
delete from public.certification_assessments where certification_name = 'Solar Engineering & Installation';

insert into public.certification_assessments
  (certification_name, assessment_name, description, certification_prompt,
   certification_level0_metric, certification_level1_metric, certification_level2_metric, certification_level3_metric,
   assessment_order)
values
('Solar Engineering & Installation', 'Site Assessment and Solar Resource',
 'Read a roof or plot of land and estimate how much usable solar energy it can deliver.',
 'Given a described site (roof or ground area, orientation, nearby shading objects, and general climate), the learner estimates realistic peak sun-hours accounting for orientation, tilt, and shading, and identifies structural condition, safe access, and cable-routing considerations before proposing a layout.',
 'Cannot estimate sun-hours or ignores shading, orientation, and structural condition entirely.',
 'States a rough sun-hours number but ignores shading objects, roof pitch, seasonal change, or site structural condition.',
 'Estimates peak sun-hours using orientation, tilt, and a shading survey; surveys roof/ground condition, structural capacity, and safe access before proposing a layout.',
 'Adjusts the estimate for seasonal sun-path change and identifies a structural or access risk that changes the design, proposing a specific mitigation.',
 40),

('Solar Engineering & Installation', 'System Sizing and Load Calculation',
 'Turn a household or business energy need into correctly sized panels, batteries, and inverter.',
 'Given a list of appliances/loads and their approximate usage, the learner builds a complete load table (watts x hours = daily watt-hours, including surge current for motors), then sizes panels (with derating), battery bank (with usable capacity and days of autonomy), and inverter (continuous and surge rating) from that table.',
 'Cannot list loads or their power draw; picks component sizes by guessing.',
 'Builds a partial load table missing run-hours or surge current, or sizes one component correctly while getting battery autonomy or inverter surge rating wrong.',
 'Builds a complete, correctly totalled load table and correctly sizes panels, battery bank, and inverter from it, accounting for derating and depth-of-discharge.',
 'Separates critical vs. deferrable loads, compares two design options (e.g. more panels vs. more battery) on cost and reliability, and justifies the choice with numbers.',
 41),

('Solar Engineering & Installation', 'Electrical Theory and Wiring Safety',
 'Calculate safe circuits and apply correct electrical safety practice.',
 'Given a system voltage, current draw, and cable run length, the learner calculates wire gauge for an acceptable voltage drop, sizes overcurrent protection, and specifies correct grounding, disconnects, and lock-out/tag-out steps before working on the system.',
 'Cannot calculate current, voltage drop, or wire size; would ignore basic safety (no disconnects, no grounding).',
 'Uses Ohm''s law for a simple case but miscalculates voltage drop or wire gauge for the actual run length, or names a safety rule without explaining or applying it correctly.',
 'Correctly calculates current draw, wire gauge for the run length (voltage drop under 3%), and overcurrent protection; specifies correct grounding, disconnects, and lock-out/tag-out steps.',
 'Compares series vs. parallel string wiring for the inverter''s input window, and identifies a specific hazard in a scenario with an exact prevention method.',
 42),

('Solar Engineering & Installation', 'Mounting and Mechanical Installation',
 'Mount and install a system so it survives wind, rain, and years of use without leaking or failing.',
 'Given a roof or ground-mount scenario with a described climate, the learner selects a mounting method appropriate to the surface, accounts for wind/rain load, seals penetrations correctly, and follows a safe, correct installation sequence ending with electrical connections and a commissioning check.',
 'Would mount panels without considering wind load, penetration sealing, or a safe sequence; would wire live circuits before mechanical work is finished.',
 'Picks a mounting method but cannot explain wind-uplift resistance or penetration sealing; names installation steps but in an unsafe or inefficient order.',
 'Selects an appropriate mounting method accounting for wind/rain load, seals all penetrations, and follows a correct sequence (structure, panels torqued to spec, cabling with strain relief, electrical connections last).',
 'Calculates or reasons through wind-uplift risk for the local climate to adjust spacing/fasteners, and explains a full commissioning check (torque, cable dressing, hot-spot check) before energizing.',
 43),

('Solar Engineering & Installation', 'Battery Storage and Inverters',
 'Choose, connect, and protect battery banks and inverters so they last and stay safe.',
 'Given a battery chemistry choice and a load/inverter scenario, the learner applies correct depth-of-discharge and charge-controller settings, provides for ventilation/thermal management, and matches inverter continuous/surge rating and voltage compatibility to the system.',
 'Treats all batteries the same; cannot match an inverter to the loads or battery system.',
 'Names a battery type but cannot explain correct depth-of-discharge or charge limits; picks an inverter by brand or price alone without checking ratings.',
 'Selects battery chemistry appropriate to budget/use case with correct depth-of-discharge and charge settings and ventilation; matches inverter rating and voltage compatibility to the load table.',
 'Compares total cost of ownership between battery chemistries for a daily use pattern, and designs for a hybrid system explaining how the inverter manages source transitions.',
 44),

('Solar Engineering & Installation', 'Codes, Standards and Certification Pathways',
 'Meet electrical code requirements and plan a realistic path to a recognized credential.',
 'Given a described installation job, the learner names the specific code/standard requirements that apply (labeling, disconnect placement, conductor sizing, permits/inspection) and lays out a realistic professional certification pathway (apprenticeship or course, recognized exam, required practical hours) with steps and timeline.',
 'Unaware that codes, permits, or inspections apply; has no plan for becoming formally qualified.',
 'Knows codes exist but cannot name a specific requirement; names one certification body but not the steps or prerequisites.',
 'Names specific code/standard requirements relevant to the job and applies them to the design; lays out a realistic certification pathway with steps and rough timeline.',
 'Identifies a conflict between a customer request and a code requirement with a compliant solution, and compares two credential pathways on cost, time, recognition, and career ceiling with clear reasons.',
 45);

-- ── 2. Starter practice modules ──────────────────────────────────────────────
-- Facilitation is generated at runtime from src/lib/solarEngineering.ts, so
-- ai_facilitator_instructions only holds module-specific guidance.
insert into public.learning_modules
  (learning_module_id, title, description, category, sub_category, ai_facilitator_instructions,
   ai_assessment_instructions, metrics_for_success, outcomes, public, grade_level,
   learning_or_certification, application, organization_id, created_at, updated_at)
select gen_random_uuid(), t.title, t.description, 'Solar Engineering & Installation', t.sub_category, t.guidance,
       'Score the Solar Engineering & Installation criteria 0-3 from the conversation; check the learner''s calculations and safety practice.',
       'Proficient (2) or higher on both criteria for this area.',
       t.description, 1, 3, 'learning', 0, null, now(), now()
from (values
  ('Reading a Tin Roof for Shading and Orientation', 'Site Assessment and Solar Resource',
   'Survey a home roof with a nearby tree and a water tank and estimate realistic peak sun-hours.',
   'Give the learner a roof orientation, a shading object, and rough coordinates or climate; have them estimate sun-hours and note the seasonal effect.'),
  ('Is This Roof Strong Enough?', 'Site Assessment and Solar Resource',
   'Check the structural condition and safe access of an aging roof before proposing a panel layout.',
   'Describe a roof with some rust or weak rafters; push the learner to identify the risk and a mitigation before laying out panels.'),
  ('Sizing a System for a Phone-Charging Shop', 'System Sizing and Load Calculation',
   'Build a load table for a small shop and size the panels, battery, and inverter from it.',
   'List 5-8 loads including a surge appliance; require the learner to total watt-hours and size each component with the maths shown.'),
  ('Cold-Room Backup: More Panels or More Battery?', 'System Sizing and Load Calculation',
   'Compare two design options for keeping a cold-room running through outages.',
   'Give the learner a refrigeration load and outage pattern; have them compare a bigger battery vs. a bigger panel array on cost and reliability.'),
  ('Choosing the Right Wire for a Long Cable Run', 'Electrical Theory and Wiring Safety',
   'Calculate voltage drop and pick a wire gauge for a battery room far from the panels.',
   'Give a current draw and cable distance; make the learner calculate voltage drop and correct wire gauge, not guess.'),
  ('What Could Go Wrong With This Wiring?', 'Electrical Theory and Wiring Safety',
   'Spot the missing disconnect, grounding, or fuse in a described DC wiring setup.',
   'Describe a wiring scenario missing one safety element; have the learner name the exact hazard and the fix.'),
  ('Mounting Panels on a Windy Rural Site', 'Mounting and Mechanical Installation',
   'Choose a mounting method and fastening plan that resists wind uplift for an exposed site.',
   'Describe an exposed rural roof or ground-mount site; push the learner to reason about wind load and penetration sealing.'),
  ('Putting the Installation Steps in the Right Order', 'Mounting and Mechanical Installation',
   'Sequence a full install from racking to commissioning safely.',
   'Give the learner a jumbled list of installation steps and have them put them in a safe, correct order with reasons.'),
  ('Lithium or Lead-Acid for This Budget?', 'Battery Storage and Inverters',
   'Compare battery chemistries on cost, depth-of-discharge, and cycle life for a real budget.',
   'Give upfront costs and cycle-life numbers for both chemistries; have the learner calculate cost per usable cycle.'),
  ('Matching an Inverter to a Mixed Load', 'Battery Storage and Inverters',
   'Pick an inverter that can handle both steady loads and a motor with high starting current.',
   'Include a motor load with a large surge current; require the learner to check both continuous and surge rating.'),
  ('What Does the Code Require Here?', 'Codes, Standards and Certification Pathways',
   'Identify the specific code requirements that apply to a described residential solar job.',
   'Describe a job missing labeling, a required disconnect location, or a permit step; have the learner name the specific requirement.'),
  ('Planning My Path to a Real Credential', 'Codes, Standards and Certification Pathways',
   'Lay out a realistic step-by-step plan to become a licensed or certified solar installer.',
   'Push the learner to name concrete steps, an estimated timeline, and cost for a real certification or licensing pathway available to them.')
) as t(title, sub_category, description, guidance);

commit;
