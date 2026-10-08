# Data Dictionary
## Education Before Electricity — Research Dataset
### Hallinan, Hao, Davidson & Clergy (2026)

**Revision:** 2, regenerated 8 October 2026 (the April 2026 files are in `archive-v1-april-2026-export/`; see the README for what changed)  
**Source tables:** `public.user_monthly_assessments`, `public.dashboard`, `public.profiles` (Supabase project: nextvillage.community)  
**Export SQL:** `export_research_data.sql`  
**Data window:** August 1, 2025 – April 30, 2026  
**Records:** 2,424 learner-days from 60 learners (after dropping any date with fewer than 5 learners); 62 learners in the cohort file; 9 months

---

## General Notes

**Learner tokens:** All three files use the same token system. Tokens are stable — the same learner has the same token in every file and in the April 2026 files. A token is a salted hash (MD5) of the account ID, 32 hexadecimal characters; not sequential by join date. The salt is in the platform's public source code, so tokens are pseudonymous, not anonymous.

**What counts as a session (revision 2):** a dashboard row where the learner started or completed something, has a chat, or holds work (a project, a canvas, a score). Rows the platform created in advance for activities the learner never opened are not sessions and are excluded. A session is dated by its first chat message (completions by the last message); rows with no chat use the row's creation date. AI Playground chats are not included in `activities_*` or `session_count`.

**Who is included:** approved student/learner accounts at the Oloibiri site (including the duplicate organization records for the site). Staff accounts (teachers, site leaders, administrators) are excluded.

**Deployment month numbering:** Computed as `EXTRACT(MONTH FROM AGE(date, '2025-06-01')) + 1`. Month 1 = June 2025 (lab launch). Month 3 = August 2025 (first month in this dataset). Month 11 = April 2026.

**Disruption periods:**
- Months 5–6 (Oct–Nov 2025): ISP outage — platform inaccessible
- Month 8 (Jan 2026): Prolonged rain — solar charging disrupted, devices uncharged
- Month 9 (Feb 2026): Facilitator absence — Bennywhite Davidson away Jan 15–Feb 28 2026

**Missing values:** `null` indicates the metric was not computed for that record, typically because the learner did not meet minimum session activity thresholds for that day/month. Do not impute; treat as missing-not-at-random.

**Activity streams:** The platform delivered four capability streams:

| Stream label (paper) | Platform activity value |
|---|---|
| English & Mathematics | `english_skills` |
| AI Proficiency | `ai_proficiency` |
| Technical & Creative | `tech_skills` / `vibe_coding` |
| Community Impact AI | `community_impact` |

---

## File 1: `learner_daily_panel.csv`

**Unit of observation:** One row per learner per activity date, for each date in an assessed month or on which the learner started a session. Assessment metrics are one value per learner-month, repeated on each day of that month.  
**Rows:** 2,424  
**Primary use:** Scaffolding decline analysis (Figure 4), reasoning trajectory (Figure 5), natural experiment (Section 4.5), PUE indicators (Section 5.3)

### Identifiers and time

| Column | Type | Description |
|---|---|---|
| `learner_token` | string | Anonymized learner identifier. Consistent across all files. |
| `activity_date` | date | Date of activity record. Format: YYYY-MM-DD. |
| `cohort_month` | date | First day of the calendar month. Format: YYYY-MM-01. |
| `deployment_month_number` | integer | Sequential deployment month. 1 = June 2025, 3 = August 2025 (first in dataset), 11 = April 2026. |
| `site` | string | Deployment site. All records: `Oloibiri`. |

### Engagement

| Column | Type | Description |
|---|---|---|
| `activities_started_today` | integer | Real sessions started on this date (see "What counts as a session"). |
| `activities_completed_today` | integer | Sessions completed on this date. |
| `certifications_earned_today` | integer | Certifications passed on this date. |
| `categories_active_today` | text[] | Array of activity stream names active this date. |
| `activities_started_total` | integer | Cumulative real sessions started through this date, including any before the window. Use for session band assignment. |
| `activities_completed_total` | integer | Cumulative sessions completed through this date. |
| `certifications_earned_total` | integer | Cumulative certifications earned through this date. |
| `session_count` | integer | Real curriculum sessions started in the assessment month (restated in October 2026; the original recorded values are kept in `session_count_raw` in the database). |
| `engaged_session_count` | integer | Sessions with substantive AI exchange above minimum message threshold. |
| `avg_words_per_session` | numeric | Average word count per learner turn across engaged sessions. Proxy for response elaboration depth. |

### Scaffolding metrics
*Pre-computed by the monthly assessment pipeline. Primary variables for Section 4.3 / Figure 4.*

| Column | Type | Description |
|---|---|---|
| `scaffold_clarification_per_session` | numeric | Average clarification requests per session. **Primary DV for scaffolding decline analysis.** Expected to decline across session bands. |
| `scaffold_decomposition_per_session` | numeric | Average decomposition requests per session — learner asks to break down a concept or problem. |
| `scaffold_consecutive_correction_runs` | numeric | Average length of consecutive AI correction sequences. Higher = more remedial exchange. |
| `scaffold_convergence_trend` | string | Direction of scaffolding demand change. Values: `improving`, `stable`, `declining`. |

### Reasoning level distribution
*Proportion of learner turns at each reasoning level. Sums to approximately 1.0 per record.*

| Column | Type | Description |
|---|---|---|
| `reasoning_level_0` | numeric | Proportion at definitional/recall level — restating facts without elaboration. |
| `reasoning_level_1` | numeric | Proportion at responsive level — answering direct questions with single-step reasoning. |
| `reasoning_level_2` | numeric | Proportion at elaborative level — extending or connecting ideas without prompting. |
| `reasoning_level_3` | numeric | Proportion at structured/chain level — multi-step reasoning or argument construction. Higher = more advanced capability. |
| `reasoning_chain_count` | integer | Count of sustained reasoning chains (3+ linked reasoning turns). |

### Metacognition

| Column | Type | Description |
|---|---|---|
| `metacog_verification_rate` | numeric | Rate of learner self-checking or requesting verification of AI outputs. |
| `metacog_reactive_rate` | numeric | Rate of reactive metacognition — correcting course after feedback. |
| `metacog_strategic_rate` | numeric | Rate of strategic metacognition — proactively planning or monitoring learning. |

### AI proficiency scores

| Column | Type | Description |
|---|---|---|
| `ai_prof_application_score` | numeric | Application dimension (0–100): directing AI toward productive tasks. |
| `ai_prof_ethics_score` | numeric | Ethics dimension (0–100): awareness of AI limitations and responsible use. |
| `ai_prof_understanding_score` | numeric | Understanding dimension (0–100): conceptual grasp of how AI works. |
| `ai_prof_verification_score` | numeric | Verification dimension (0–100): ability to evaluate AI outputs. |
| `ai_prof_min_score` | numeric | Minimum across all four dimensions. Conservative certification threshold. |
| `ai_prof_cert_level` | string | Proficiency tier. Values that occur in the data: `Not Attempted` or empty. (The tiers `Novice`, `Developing`, `Proficient` and `Advanced` are defined but were not recorded for any learner.) |

### Core capability scores

| Column | Type | Description |
|---|---|---|
| `cognitive_score` | numeric | Cognitive abilities (0–100). LLM rubric evaluation of session transcripts. |
| `critical_thinking_score` | numeric | Critical thinking (0–100). Analysis, synthesis, evaluation in learner-AI exchanges. |
| `problem_solving_score` | numeric | Problem-solving (0–100). Problem identification, solution generation, implementation reasoning. |
| `creativity_score` | numeric | Creativity (0–100). Novelty, elaboration, originality in learner outputs. |

### Productive Use of Energy (PUE) indicators
*The paper's primary capability-to-investment-conversion metrics. See paper Appendix B for full rubric.*

| Column | Type | Description |
|---|---|---|
| `pue_score` | numeric | Composite PUE understanding score (0–100). |
| `pue_energy_constraint_pct` | numeric | % of PUE exchanges referencing energy constraints (load, charging, power availability). |
| `pue_market_pricing_pct` | numeric | % referencing market pricing or commercial opportunity. |
| `pue_enterprise_planning_pct` | numeric | % involving enterprise planning or business model reasoning. |
| `pue_learner_initiated_pct` | numeric | % of PUE discussion initiated by learner (not AI). Agency indicator. |
| `pue_multi_domain_pct` | numeric | % connecting PUE concepts across multiple domains. |
| `pue_local_context_pct` | numeric | % grounded in Oloibiri-specific productive context. Contextualization indicator. |

### Role readiness signals
*Behavioural precursors of productive-use conversion. Paper Section 4.4 / Table 4.*

| Column | Type | Description |
|---|---|---|
| `role_readiness_signal` | integer | Composite role readiness score. |
| `role_teaching_intent_count` | integer | Turns where learner expresses intent to teach others. Peer diffusion precursor. |
| `role_community_application_count` | integer | Turns applying learning to specific community problems. |
| `role_enterprise_orientation_count` | integer | Turns expressing enterprise or income-generation orientation. |
| `role_intergenerational_count` | integer | Turns referencing intergenerational teaching or family application. |
| `peer_diffusion_signal` | integer | Composite signal for household/community diffusion of learning beyond the lab. |

### Certification outcomes

| Column | Type | Description |
|---|---|---|
| `cert_attempted_count` | integer | Certification assessments attempted in the assessment period. |
| `cert_passed_count` | integer | Certifications passed. |
| `cert_avg_score` | numeric | Average score across certifications attempted. |
| `cert_names_passed` | text[] | Array of certification names passed. |
| `ci_tracks_active_count` | integer | Community Impact tracks active. |
| `ci_certs_passed_count` | integer | Community Impact certifications passed. |

### Enterprise artifact quality

| Column | Type | Description |
|---|---|---|
| `artifact_produced` | boolean | Whether learner produced a structured enterprise planning artifact this period. **Empty in this export** (the scores exist in the monthly assessments as `enterprise_artifact_*` but have not been mapped to these columns). |
| `artifact_quality_score` | numeric | Overall artifact quality (0–1). |
| `artifact_goal_specificity` | numeric | Specificity of stated goals (0–1). |
| `artifact_resource_spec` | numeric | Resource identification and specification (0–1). |
| `artifact_implementation_steps` | numeric | Concreteness of implementation planning (0–1). |
| `artifact_constraint_integration` | numeric | Awareness of real-world constraints (0–1). |
| `artifact_quantitative_reasoning` | numeric | Use of numbers, quantities, or estimates (0–1). |
| `artifact_feasibility` | numeric | Overall feasibility of the plan (0–1). |
| `is_persistent_learner` | boolean | Real sessions in 3 or more calendar months of the window. Empty in the April 2026 export. |

---

## File 2: `learner_cohort_summary.csv`

**Unit of observation:** One row per learner.  
**Rows:** 62.  
**Primary use:** Cohort characterization (Table 2), session band analysis (Table 3), certification outcomes (Section 4.4).

| Column | Type | Description |
|---|---|---|
| `learner_token` | string | Anonymized learner identifier. |
| `grade_band` | string | Grade level, pre-binned. Values: `1-4`, `5-8`, `9-12`, or empty when no grade is recorded. |
| `total_activities_started` | integer | Total real sessions started through 2026-04-30, including any before the window. **Use for session band assignment.** |
| `total_activities_completed` | integer | Total sessions completed. |
| `total_certifications_earned` | integer | Formal certifications earned (a certificate was issued) through 2026-04-30. |
| `active_days` | integer | Distinct dates on which a real session started. |
| `active_months` | integer | Distinct months with recorded activity. |
| `first_active_date` | date | First date with activity in the data window. |
| `last_active_date` | date | Last date with activity. |
| `session_band` | string | Revision 2 values: `Early (<25)`, `Developing (25-49)`, `Established (50-99)`, `Core (100+)`; empty when the learner has no real session. The April 2026 export used `Emerging (1-10)`, `Developing (11-25)`, `Established (26-50)`, `Core (50+)` on counts that included pre-created rows, so paper Table 3 built on that export needs recomputing. |
| `peak_pue_score` | numeric | Highest PUE score across all assessment periods. |
| `peak_role_readiness_signal` | integer | Highest role readiness signal recorded. |
| `highest_ai_prof_level` | string | Highest AI proficiency tier achieved. Values: `Novice`, `Developing`, `Proficient`, `Advanced`. |
| `total_certs_passed` | integer | Same as `total_certifications_earned` in revision 2: formal certifications earned. Primary certification outcome variable. |
| `ever_produced_artifact` | boolean | **Empty in this export.** |
| `peak_artifact_quality` | numeric | **Empty in this export.** |
| `peak_peer_diffusion_signal` | integer | Highest peer diffusion signal recorded. |
| `is_persistent_learner` | boolean | Real sessions in 3 or more calendar months of the window. |
| `site` | string | All records: `Oloibiri`. |

---

## File 3: `disruption_periods.csv`

**Unit of observation:** One row per calendar month.  
**Rows:** 9 (August 2025 – April 2026). A month is omitted if fewer than 5 learners were active in it; none were omitted in revision 2.  
**Primary use:** Natural experiment analysis (Section 4.5).

| Column | Type | Description |
|---|---|---|
| `cohort_month` | date | First day of month. Format: YYYY-MM-01. |
| `deployment_month_number` | integer | Sequential month (3 = August 2025, 11 = April 2026). |
| `period_type` | string | Values: `Active`, `ISP_outage` (Oct–Nov 2025), `Solar_weather` (Jan 2026), `Facilitator_absent` (Feb 2026). |
| `facilitator_present` | boolean | `false` only for Feb 2026. |
| `platform_accessible` | boolean | `false` for Oct–Nov 2025. |
| `adequate_solar` | boolean | `false` for Jan 2026. |
| `active_learners` | integer | Distinct learners who started a real session this month. |
| `total_sessions` | integer | Community total real sessions started this month. |
| `total_completions` | integer | Community total completed sessions. |
| `total_certifications` | integer | Community total certifications earned. |
| `avg_scaffold_clarification` | numeric | Community average clarification requests per session. |
| `avg_scaffold_decomposition` | numeric | Community average decomposition requests per session. |
| `avg_correction_runs` | numeric | Community average consecutive correction run length. |
| `avg_reasoning_l0` | numeric | Community average proportion of turns at reasoning level 0. |
| `avg_reasoning_l1` | numeric | Community average proportion at reasoning level 1. |
| `avg_reasoning_l2` | numeric | Community average proportion at reasoning level 2. |
| `avg_reasoning_l3` | numeric | Community average proportion at reasoning level 3. |
| `avg_pue_score` | numeric | Community average PUE score. |
| `avg_role_readiness` | numeric | Community average role readiness signal. |
| `avg_ai_prof_score` | numeric | Community average AI proficiency minimum score. |
| `site` | string | All records: `Oloibiri`. |

**Note on January 2026:** Combines two disruption types — solar/weather throughout the month and facilitator absence from January 15. Coded as `Solar_weather` because solar disruption predates and is independent of facilitator absence. For modelling the facilitator effect, treat January as a partial-absence month and consider sensitivity analyses excluding it.

---

## Assessment Instrument Note

Capability scores and scaffolding metrics were computed by a serverless pipeline (`api/assess-monthly.ts`) submitting aggregated session transcripts to an LLM with embedded rubrics. Assessment model: `gpt-4o` through December 2025, `claude-sonnet-4-6` from January 2026 onward. This discontinuity is noted in paper Section 3.3. For robustness analysis, restrict to single-model periods or include `assessment_model` as a covariate (available in `user_monthly_assessments`; not included in `dashboard_stats` exports).
