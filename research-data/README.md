# Education Before Electricity — Research Data

**Paper:** Hallinan, K.P., Hao, L., Davidson, B., & Clergy, S. (2026). Education Before Electricity: AI-Facilitated Capability Formation as a Pre-Condition for Productive Energy Use in Off-Grid Communities. *Submitted to Energy Research & Social Science.*

**Platform:** nextvillage.community  
**Deployment site:** Davidson AI Innovation Center (vAI), Oloibiri, Bayelsa State, Nigeria  
**Lab established:** June 2025  
**First learner activity:** July 15, 2025  
**Data window (this repository):** August 2025 – April 2026  
**Corresponding author:** Kevin P. Hallinan — khallinan1@udayton.edu

---

## Repository Contents

```
research-data/
  learner_daily_panel.csv          # Longitudinal daily panel — primary analysis dataset
  learner_cohort_summary.csv       # One row per learner — cohort characteristics and totals
  disruption_periods.csv           # Monthly aggregates — natural experiment data
  data_dictionary.md               # Variable definitions for all three files
  README.md                        # This file
  export_anonymized.sql            # SQL used to generate all three CSVs from Supabase
```

---

## Deployment Context

Oloibiri is a community of approximately 8,000 residents in Bayelsa State, Nigeria — the site of Nigeria's first commercial oil well (1956) and a community whose productive capacity was systematically displaced by decades of oil extraction without corresponding investment in human capital. The community has access to solar electricity via a Renewvia Energy Africa microgrid but has lacked the human capability infrastructure necessary to convert that electricity into productive economic activity.

The Davidson AI Innovation Center (vAI) was established in June 2025 by community leader Bennywhite Davidson (co-author) with support from the University of Dayton research team. The center deployed the `nextvillage.community` platform — a React/TypeScript application with a Supabase backend and multi-provider AI routing — to deliver four integrated capability streams to community members with zero prior computer access:

- **English & Mathematics** — foundational literacy and numeracy
- **AI Proficiency & Digital Literacy** — AI literacy, prompt engineering, digital citizenship
- **Technical & Creative Skills** — coding, content creation, digital tools
- **Community Impact AI** — health navigation, agricultural consulting, enterprise development

The deployment reached 88 unique learners over the study period. Two learners are identified by name in the paper as longitudinal case studies — Silas Clergy (co-author, software developer) and Solomon Matthias Solomon (community health navigator) — with their explicit consent.

---

## Data Coverage Note

The lab launched in June 2025 and recorded first learner activity on July 15, 2025. The `dashboard_stats` table — the source for all three CSV files in this repository — was implemented in August 2025 as part of a platform hardening phase. June and July 2025 session records exist in the raw `dashboard` table in the Supabase backend but were not backfilled into `dashboard_stats`.

Researchers should note:
- **June–July 2025**: deployment and onboarding period; session data available from corresponding author on request
- **August 2025 – April 2026**: full pre-computed metrics available in this repository (3,012 learner-day records)
- **Paper references to "11-month deployment"** span June 2025 – April 2026; quantitative analyses draw on the August 2025 – April 2026 window unless otherwise noted

---

## Anonymization Protocol

All three datasets were generated from `public.dashboard_stats` using the SQL in `export_anonymized.sql`. Anonymization was implemented at the database layer before export:

**Pseudonymization:** The `dashboard_stats` table uses platform-generated `learner_token` values (e.g. `L001`–`L088`) in place of raw Supabase `user_id` UUID values. Tokens are stable across all three files — the same learner has the same token everywhere. Tokens cannot be reversed to identify individuals without access to the platform's authentication records.

**K-anonymity suppression:** The platform's edge function implements k-anonymity (k=3) at write time. Rows where a learner's activity pattern constitutes a rare combination that could facilitate re-identification are flagged `k_anon_suppressed = true` and excluded from all three exports. Of 3,181 total Oloibiri rows in the study window, 169 (4.7%) were suppressed — concentrated in disruption-period months when active learner counts were low.

**Attribute binning:** `grade_band` (already binned in `dashboard_stats`) replaces raw grade level. No precise birthdates or ages are recorded in the platform.

**Content exclusion:** Raw chat transcripts are not included. Scaffolding metrics are pre-computed aggregates (clarification requests per session, decomposition requests per session) that convey instructional dependency without exposing message content.

**Named case studies:** Silas Clergy and Solomon Matthias Solomon are identified by name in the paper with their explicit consent. Their learner tokens are not disclosed in this repository to avoid enabling cross-referencing with any other learner record.

---

## Natural Experiment: Disruption Periods

The deployment experienced three distinct disruption events that are central to the paper's causal identification strategy (Section 4.5). Each disruption operates through a different mechanism, demonstrating system fragility at each infrastructure layer:

| Period | Months | Disruption type | Layer |
|---|---|---|---|
| Active baseline | Aug–Sep 2025 | None | — |
| ISP outage | Oct–Nov 2025 | Internet failure | Connectivity |
| Active recovery | Dec 2025 | None | — |
| Solar/weather | Jan 2026 | Prolonged rain; devices uncharged | Energy |
| Facilitator absence | Feb 2026 | Bennywhite Davidson away Jan 15–Feb 28 | Human |
| Active recovery | Mar–Apr 2026 | None | — |

The January 2026 period combines solar disruption with the beginning of Bennywhite's absence (he departed January 15). The `disruption_periods.csv` file codes these separately with binary flags (`facilitator_present`, `platform_accessible`, `adequate_solar`) to support disaggregated analysis.

The three disruption types are analytically separable and represent distinct investment risks for rural electrification projects: connectivity infrastructure risk, solar reliability risk, and facilitator retention risk. All three produced near-zero community engagement despite unchanged curriculum and (in the case of facilitator absence) unchanged technology and connectivity — a finding the paper interprets as evidence that productive learning requires simultaneous adequacy across all three layers.

---

## Key Variables for Paper Replication

### Scaffolding demand decline (Paper Figure 4 / Section 4.3)
Use `learner_daily_panel.csv`:
- Sort by `learner_token`, then compute `cumulative_sessions` as running sum of `activities_started_today` per learner
- Assign session band from cumulative total: Emerging (1–10), Developing (11–25), Established (26–50), Core (50+)
- DV: `scaffold_clarification_per_session` — expected to decline monotonically across bands
- Exclude disruption-period months for the primary analysis; include for the natural experiment analysis

### Facilitator absence natural experiment (Paper Section 4.5)
Use `disruption_periods.csv`:
- Compare `active_learners`, `total_sessions`, and `avg_scaffold_clarification` across `period_type` values
- Binary flags (`facilitator_present`, `platform_accessible`, `adequate_solar`) enable regression with each disruption type as a separate covariate

### Role readiness signals (Paper Section 4.4 / Table 4)
Use `learner_daily_panel.csv`:
- Key variables: `role_readiness_signal`, `role_teaching_intent_count`, `role_community_application_count`, `role_enterprise_orientation_count`
- Cross-tabulate with session band to show readiness concentration in Core band

### Certification outcomes (Paper Section 4.4)
Use `learner_cohort_summary.csv`:
- `total_certs_passed` is the primary certification count variable
- `highest_ai_prof_level` maps to the paper's AI proficiency tier analysis
- `ever_produced_artifact` and `peak_artifact_quality` support the enterprise readiness analysis

### PUE conversion indicators (Paper Section 5.3)
Use `learner_daily_panel.csv`:
- `pue_score` — composite productive use of energy understanding score
- `pue_learner_initiated_pct` — proportion of PUE discussion initiated by learner (agency indicator)
- `pue_local_context_pct` — proportion grounded in Oloibiri-specific productive context

---

## Citation

If you use these data, please cite:

> Hallinan, K.P., Hao, L., Davidson, B., & Clergy, S. (2026). Education Before Electricity: AI-Facilitated Capability Formation as a Pre-Condition for Productive Energy Use in Off-Grid Communities. *Energy Research & Social Science* [submitted]. Data: https://github.com/khallinan12345/nextvillage-community

---

## Contact and Data Access

Kevin P. Hallinan  
Emeritus Professor, Mechanical and Aerospace Engineering  
University of Dayton, 300 College Park, Dayton, Ohio 45469, USA  
khallinan1@udayton.edu

Researchers requesting access to June–July 2025 session data, raw `dashboard` records (under data sharing agreement), or the platform codebase for replication purposes should contact the corresponding author. Access to identified data requires IRB approval at the requesting institution.
