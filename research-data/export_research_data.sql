-- Research export for "Education Before Electricity" (Hallinan, Hao, Davidson & Clergy, 2026).
-- Revision 2, 2026-10-08. Run each query in the Supabase SQL editor and download the result as CSV:
--   Query 1 -> learner_daily_panel.csv
--   Query 2 -> learner_cohort_summary.csv
--   Query 3 -> disruption_periods.csv
-- (Download CSVs write SQL NULL as an empty cell; the files in this folder write it as the word null.)
--
-- What is different from the April 2026 export (kept in archive-v1-april-2026-export/):
--   * A session is a real session: a dashboard row where the learner started or completed something,
--     or has a chat, or holds work. Rows the platform pre-created for activities a learner never
--     opened are not sessions and are excluded. (Previously they were counted, which put almost every
--     learner in the top session band.)
--   * Sessions are dated by their first chat message, not by when the row was created, and completions
--     by the last message. Row creation dates were the signup date for pre-created rows.
--   * Staff accounts (teachers, site leaders, administrators) are excluded; only approved student/learner
--     accounts at the Oloibiri site are included.
--   * Session bands are Early (<25), Developing (25-49), Established (50-99), Core (100+), assigned from
--     total_activities_started (real sessions through 2026-04-30, including any before the window).
--   * Anonymity: a learner-day, or a month, is dropped when fewer than 5 learners are present (this is what
--     the platform code enforces; the earlier README said 3).
--   * Assessment metrics (scaffolding, reasoning, capability, PUE, role signals) are unchanged: they come
--     from user_monthly_assessments, one assessment per learner-month, repeated on each day of that month.
--   * artifact_* fields are left empty, as in the earlier export. is_persistent_learner = real sessions in
--     3 or more calendar months of the window (it was empty before).
--
-- Window: 2025-08-01 to 2026-04-30. Change params below to move it.

-- ===== Query 1: learner_daily_panel.csv =====
WITH params AS (
  SELECT DATE '2025-08-01' AS w_start, DATE '2026-04-30' AS w_end, 5 AS k_min
),
pop AS (  -- enrolled learners at the Oloibiri site; staff accounts are excluded
  SELECT p.id, learner_token(p.id) AS tok,
         CASE WHEN p.grade_level IS NULL THEN NULL WHEN p.grade_level <= 4 THEN '1-4'
              WHEN p.grade_level <= 8 THEN '5-8' ELSE '9-12' END AS grade_band
  FROM profiles p
  WHERE p.role IN ('student', 'learner') AND p.membership_status = 'approved'
    AND site_org_id(p.organization_id, p.city) = 'a1b2c3d4-0001-0001-0001-000000000001'::uuid
),
started AS (  -- real curriculum sessions, dated by the first message (not by when the row was created)
  SELECT d.user_id, COALESCE(first_message_at(d.chat_history::text), d.created_at)::date AS day,
         d.category_activity AS cat
  FROM dashboard d, params
  WHERE d.user_id IN (SELECT id FROM pop) AND NOT dashboard_row_is_placeholder(d)
    AND COALESCE(first_message_at(d.chat_history::text), d.created_at)::date <= params.w_end
),
completed AS (  -- completed sessions, dated by the last message
  SELECT d.user_id, COALESCE(last_message_at(d.chat_history::text), d.updated_at)::date AS day
  FROM dashboard d, params
  WHERE d.user_id IN (SELECT id FROM pop) AND d.progress = 'completed' AND NOT dashboard_row_is_placeholder(d)
    AND COALESCE(last_message_at(d.chat_history::text), d.updated_at)::date <= params.w_end
),
certs AS (  -- formal certifications (a certificate was issued)
  SELECT d.user_id, d.updated_at::date AS day
  FROM dashboard d, params
  WHERE d.user_id IN (SELECT id FROM pop) AND d.certificate_pdf_url IS NOT NULL
    AND d.updated_at::date <= params.w_end
),
asm AS (  -- the latest monthly assessment for each learner-month in the window
  SELECT DISTINCT ON (u.user_id, date_trunc('month', u.measured_at))
         u.*, date_trunc('month', u.measured_at)::date AS mo
  FROM user_monthly_assessments u, params
  WHERE u.user_id IN (SELECT id FROM pop)
    AND u.measured_at >= params.w_start AND u.measured_at < params.w_end + 1
  ORDER BY u.user_id, date_trunc('month', u.measured_at), u.measured_at DESC
),
persistent AS (  -- real sessions in 3 or more calendar months of the window
  SELECT s.user_id, COUNT(DISTINCT date_trunc('month', s.day)) >= 3 AS is_persistent
  FROM started s, params
  WHERE s.day >= params.w_start
  GROUP BY s.user_id
),
days AS (
  SELECT gs::date AS d FROM params, generate_series(params.w_start, params.w_end, interval '1 day') gs
),
frame AS (  -- a row per learner per day: in an assessed month, or a session started that day
  SELECT p.id, p.tok, p.grade_band, dd.d
  FROM pop p CROSS JOIN days dd
  WHERE EXISTS (SELECT 1 FROM asm a WHERE a.user_id = p.id AND a.mo = date_trunc('month', dd.d)::date)
     OR EXISTS (SELECT 1 FROM started s WHERE s.user_id = p.id AND s.day = dd.d)
),
kept AS (SELECT f.*, COUNT(*) OVER (PARTITION BY f.d) AS cohort_size FROM frame f)
SELECT
  k.tok AS learner_token,
  k.d AS activity_date,
  date_trunc('month', k.d)::date AS cohort_month,
  ((EXTRACT(year FROM k.d)::int * 12 + EXTRACT(month FROM k.d)::int) - (2025 * 12 + 6) + 1) AS deployment_month_number,
  (SELECT COUNT(*) FROM started s WHERE s.user_id = k.id AND s.day = k.d) AS activities_started_today,
  (SELECT COUNT(*) FROM completed c WHERE c.user_id = k.id AND c.day = k.d) AS activities_completed_today,
  (SELECT COUNT(*) FROM certs c WHERE c.user_id = k.id AND c.day = k.d) AS certifications_earned_today,
  (SELECT to_jsonb(array_agg(DISTINCT s.cat ORDER BY s.cat))::text FROM started s
     WHERE s.user_id = k.id AND s.day = k.d AND s.cat IS NOT NULL) AS categories_active_today,
  (SELECT COUNT(*) FROM started s WHERE s.user_id = k.id AND s.day <= k.d) AS activities_started_total,
  (SELECT COUNT(*) FROM completed c WHERE c.user_id = k.id AND c.day <= k.d) AS activities_completed_total,
  (SELECT COUNT(*) FROM certs c WHERE c.user_id = k.id AND c.day <= k.d) AS certifications_earned_total,
  a.session_count, a.engaged_session_count, a.avg_words_per_session,
  a.scaffold_clarification_per_session, a.scaffold_decomposition_per_session,
  a.scaffold_consecutive_correction_runs, a.scaffold_convergence_trend,
  a.reasoning_level_0, a.reasoning_level_1, a.reasoning_level_2, a.reasoning_level_3, a.reasoning_chain_count,
  a.metacog_verification_rate, a.metacog_reactive_rate, a.metacog_strategic_rate,
  a.ai_prof_application_score, a.ai_prof_ethics_score, a.ai_prof_understanding_score,
  a.ai_prof_verification_score, a.ai_prof_min_score, a.ai_prof_cert_level,
  a.cognitive_score, a.critical_thinking_score, a.problem_solving_score, a.creativity_score,
  a.pue_score, a.pue_energy_constraint_pct, a.pue_market_pricing_pct, a.pue_enterprise_planning_pct,
  a.pue_learner_initiated_pct, a.pue_multi_domain_pct, a.pue_local_context_pct,
  a.role_readiness_signal, a.role_teaching_intent_count, a.role_community_application_count,
  a.role_enterprise_orientation_count, a.role_intergenerational_count, a.peer_diffusion_signal,
  a.cert_attempted_count, a.cert_passed_count, a.cert_avg_score,
  to_jsonb(a.cert_names_passed)::text AS cert_names_passed,
  a.ci_tracks_active_count, a.ci_certs_passed_count,
  NULL::boolean AS artifact_produced, NULL::numeric AS artifact_quality_score,
  NULL::numeric AS artifact_goal_specificity, NULL::numeric AS artifact_resource_spec,
  NULL::numeric AS artifact_implementation_steps, NULL::numeric AS artifact_constraint_integration,
  NULL::numeric AS artifact_quantitative_reasoning, NULL::numeric AS artifact_feasibility,
  COALESCE(pe.is_persistent, false) AS is_persistent_learner,
  'Oloibiri' AS site
FROM kept k CROSS JOIN params
LEFT JOIN asm a ON a.user_id = k.id AND a.mo = date_trunc('month', k.d)::date
LEFT JOIN persistent pe ON pe.user_id = k.id
WHERE k.cohort_size >= params.k_min
ORDER BY k.tok, k.d;

-- ===== Query 2: learner_cohort_summary.csv =====
WITH params AS (
  SELECT DATE '2025-08-01' AS w_start, DATE '2026-04-30' AS w_end, 5 AS k_min
),
pop AS (  -- enrolled learners at the Oloibiri site; staff accounts are excluded
  SELECT p.id, learner_token(p.id) AS tok,
         CASE WHEN p.grade_level IS NULL THEN NULL WHEN p.grade_level <= 4 THEN '1-4'
              WHEN p.grade_level <= 8 THEN '5-8' ELSE '9-12' END AS grade_band
  FROM profiles p
  WHERE p.role IN ('student', 'learner') AND p.membership_status = 'approved'
    AND site_org_id(p.organization_id, p.city) = 'a1b2c3d4-0001-0001-0001-000000000001'::uuid
),
started AS (  -- real curriculum sessions, dated by the first message (not by when the row was created)
  SELECT d.user_id, COALESCE(first_message_at(d.chat_history::text), d.created_at)::date AS day,
         d.category_activity AS cat
  FROM dashboard d, params
  WHERE d.user_id IN (SELECT id FROM pop) AND NOT dashboard_row_is_placeholder(d)
    AND COALESCE(first_message_at(d.chat_history::text), d.created_at)::date <= params.w_end
),
completed AS (  -- completed sessions, dated by the last message
  SELECT d.user_id, COALESCE(last_message_at(d.chat_history::text), d.updated_at)::date AS day
  FROM dashboard d, params
  WHERE d.user_id IN (SELECT id FROM pop) AND d.progress = 'completed' AND NOT dashboard_row_is_placeholder(d)
    AND COALESCE(last_message_at(d.chat_history::text), d.updated_at)::date <= params.w_end
),
certs AS (  -- formal certifications (a certificate was issued)
  SELECT d.user_id, d.updated_at::date AS day
  FROM dashboard d, params
  WHERE d.user_id IN (SELECT id FROM pop) AND d.certificate_pdf_url IS NOT NULL
    AND d.updated_at::date <= params.w_end
),
asm AS (  -- the latest monthly assessment for each learner-month in the window
  SELECT DISTINCT ON (u.user_id, date_trunc('month', u.measured_at))
         u.*, date_trunc('month', u.measured_at)::date AS mo
  FROM user_monthly_assessments u, params
  WHERE u.user_id IN (SELECT id FROM pop)
    AND u.measured_at >= params.w_start AND u.measured_at < params.w_end + 1
  ORDER BY u.user_id, date_trunc('month', u.measured_at), u.measured_at DESC
),
persistent AS (  -- real sessions in 3 or more calendar months of the window
  SELECT s.user_id, COUNT(DISTINCT date_trunc('month', s.day)) >= 3 AS is_persistent
  FROM started s, params
  WHERE s.day >= params.w_start
  GROUP BY s.user_id
),
base AS (
  SELECT p.id, p.tok, p.grade_band FROM pop p
  WHERE EXISTS (SELECT 1 FROM started s WHERE s.user_id = p.id)
     OR EXISTS (SELECT 1 FROM asm a WHERE a.user_id = p.id)
)
SELECT
  b.tok AS learner_token,
  b.grade_band,
  n.total AS total_activities_started,
  (SELECT COUNT(*) FROM completed c WHERE c.user_id = b.id) AS total_activities_completed,
  (SELECT COUNT(*) FROM certs c WHERE c.user_id = b.id) AS total_certifications_earned,
  (SELECT COUNT(DISTINCT s.day) FROM started s WHERE s.user_id = b.id) AS active_days,
  (SELECT COUNT(DISTINCT date_trunc('month', s.day)) FROM started s WHERE s.user_id = b.id) AS active_months,
  (SELECT MIN(s.day) FROM started s WHERE s.user_id = b.id) AS first_active_date,
  (SELECT MAX(s.day) FROM started s WHERE s.user_id = b.id) AS last_active_date,
  CASE WHEN n.total = 0 THEN NULL
       WHEN n.total < 25 THEN 'Early (<25)'
       WHEN n.total < 50 THEN 'Developing (25-49)'
       WHEN n.total < 100 THEN 'Established (50-99)'
       ELSE 'Core (100+)' END AS session_band,
  (SELECT MAX(a.pue_score) FROM asm a WHERE a.user_id = b.id) AS peak_pue_score,
  (SELECT MAX(a.role_readiness_signal) FROM asm a WHERE a.user_id = b.id) AS peak_role_readiness_signal,
  (SELECT a.ai_prof_cert_level FROM asm a WHERE a.user_id = b.id AND a.ai_prof_cert_level IS NOT NULL
     ORDER BY CASE a.ai_prof_cert_level WHEN 'Advanced' THEN 5 WHEN 'Proficient' THEN 4
              WHEN 'Developing' THEN 3 WHEN 'Novice' THEN 2 WHEN 'Not Attempted' THEN 1 ELSE 0 END DESC
     LIMIT 1) AS highest_ai_prof_level,
  (SELECT COUNT(*) FROM certs c WHERE c.user_id = b.id) AS total_certs_passed,
  NULL::boolean AS ever_produced_artifact,
  NULL::numeric AS peak_artifact_quality,
  (SELECT MAX(a.peer_diffusion_signal) FROM asm a WHERE a.user_id = b.id) AS peak_peer_diffusion_signal,
  COALESCE(pe.is_persistent, false) AS is_persistent_learner,
  'Oloibiri' AS site
FROM base b
CROSS JOIN LATERAL (SELECT COUNT(*) AS total FROM started s WHERE s.user_id = b.id) n
LEFT JOIN persistent pe ON pe.user_id = b.id
ORDER BY b.tok;

-- ===== Query 3: disruption_periods.csv =====
WITH params AS (
  SELECT DATE '2025-08-01' AS w_start, DATE '2026-04-30' AS w_end, 5 AS k_min
),
pop AS (  -- enrolled learners at the Oloibiri site; staff accounts are excluded
  SELECT p.id, learner_token(p.id) AS tok,
         CASE WHEN p.grade_level IS NULL THEN NULL WHEN p.grade_level <= 4 THEN '1-4'
              WHEN p.grade_level <= 8 THEN '5-8' ELSE '9-12' END AS grade_band
  FROM profiles p
  WHERE p.role IN ('student', 'learner') AND p.membership_status = 'approved'
    AND site_org_id(p.organization_id, p.city) = 'a1b2c3d4-0001-0001-0001-000000000001'::uuid
),
started AS (  -- real curriculum sessions, dated by the first message (not by when the row was created)
  SELECT d.user_id, COALESCE(first_message_at(d.chat_history::text), d.created_at)::date AS day,
         d.category_activity AS cat
  FROM dashboard d, params
  WHERE d.user_id IN (SELECT id FROM pop) AND NOT dashboard_row_is_placeholder(d)
    AND COALESCE(first_message_at(d.chat_history::text), d.created_at)::date <= params.w_end
),
completed AS (  -- completed sessions, dated by the last message
  SELECT d.user_id, COALESCE(last_message_at(d.chat_history::text), d.updated_at)::date AS day
  FROM dashboard d, params
  WHERE d.user_id IN (SELECT id FROM pop) AND d.progress = 'completed' AND NOT dashboard_row_is_placeholder(d)
    AND COALESCE(last_message_at(d.chat_history::text), d.updated_at)::date <= params.w_end
),
certs AS (  -- formal certifications (a certificate was issued)
  SELECT d.user_id, d.updated_at::date AS day
  FROM dashboard d, params
  WHERE d.user_id IN (SELECT id FROM pop) AND d.certificate_pdf_url IS NOT NULL
    AND d.updated_at::date <= params.w_end
),
asm AS (  -- the latest monthly assessment for each learner-month in the window
  SELECT DISTINCT ON (u.user_id, date_trunc('month', u.measured_at))
         u.*, date_trunc('month', u.measured_at)::date AS mo
  FROM user_monthly_assessments u, params
  WHERE u.user_id IN (SELECT id FROM pop)
    AND u.measured_at >= params.w_start AND u.measured_at < params.w_end + 1
  ORDER BY u.user_id, date_trunc('month', u.measured_at), u.measured_at DESC
),
persistent AS (  -- real sessions in 3 or more calendar months of the window
  SELECT s.user_id, COUNT(DISTINCT date_trunc('month', s.day)) >= 3 AS is_persistent
  FROM started s, params
  WHERE s.day >= params.w_start
  GROUP BY s.user_id
),
months AS (
  SELECT gs::date AS mo FROM generate_series(DATE '2025-08-01', DATE '2026-04-01', interval '1 month') gs
),
agg AS (
  SELECT m.mo,
    (SELECT COUNT(DISTINCT s.user_id) FROM started s WHERE date_trunc('month', s.day)::date = m.mo) AS active_learners,
    (SELECT COUNT(*) FROM started s WHERE date_trunc('month', s.day)::date = m.mo) AS total_sessions,
    (SELECT COUNT(*) FROM completed c WHERE date_trunc('month', c.day)::date = m.mo) AS total_completions,
    (SELECT COUNT(*) FROM certs c WHERE date_trunc('month', c.day)::date = m.mo) AS total_certifications,
    (SELECT AVG(a.scaffold_clarification_per_session) FROM asm a WHERE a.mo = m.mo) AS avg_scaffold_clarification,
    (SELECT AVG(a.scaffold_decomposition_per_session) FROM asm a WHERE a.mo = m.mo) AS avg_scaffold_decomposition,
    (SELECT AVG(a.scaffold_consecutive_correction_runs) FROM asm a WHERE a.mo = m.mo) AS avg_correction_runs,
    (SELECT AVG(a.reasoning_level_0) FROM asm a WHERE a.mo = m.mo) AS avg_reasoning_l0,
    (SELECT AVG(a.reasoning_level_1) FROM asm a WHERE a.mo = m.mo) AS avg_reasoning_l1,
    (SELECT AVG(a.reasoning_level_2) FROM asm a WHERE a.mo = m.mo) AS avg_reasoning_l2,
    (SELECT AVG(a.reasoning_level_3) FROM asm a WHERE a.mo = m.mo) AS avg_reasoning_l3,
    (SELECT AVG(a.pue_score) FROM asm a WHERE a.mo = m.mo) AS avg_pue_score,
    (SELECT AVG(a.role_readiness_signal) FROM asm a WHERE a.mo = m.mo) AS avg_role_readiness,
    (SELECT AVG(a.ai_prof_min_score) FROM asm a WHERE a.mo = m.mo) AS avg_ai_prof_score
  FROM months m
)
SELECT
  g.mo AS cohort_month,
  ((EXTRACT(year FROM g.mo)::int * 12 + EXTRACT(month FROM g.mo)::int) - (2025 * 12 + 6) + 1) AS deployment_month_number,
  CASE WHEN g.mo IN (DATE '2025-10-01', DATE '2025-11-01') THEN 'ISP_outage'
       WHEN g.mo = DATE '2026-01-01' THEN 'Solar_weather'
       WHEN g.mo = DATE '2026-02-01' THEN 'Facilitator_absent'
       ELSE 'Active' END AS period_type,
  (g.mo <> DATE '2026-02-01') AS facilitator_present,
  (g.mo NOT IN (DATE '2025-10-01', DATE '2025-11-01')) AS platform_accessible,
  (g.mo <> DATE '2026-01-01') AS adequate_solar,
  g.active_learners, g.total_sessions, g.total_completions, g.total_certifications,
  g.avg_scaffold_clarification, g.avg_scaffold_decomposition, g.avg_correction_runs,
  g.avg_reasoning_l0, g.avg_reasoning_l1, g.avg_reasoning_l2, g.avg_reasoning_l3,
  g.avg_pue_score, g.avg_role_readiness, g.avg_ai_prof_score,
  'Oloibiri' AS site
FROM agg g, params
WHERE g.active_learners >= params.k_min
ORDER BY g.mo;
