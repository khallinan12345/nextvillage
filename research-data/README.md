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
  learner_daily_panel.csv          # Longitudinal daily panel (revision 2)
  learner_cohort_summary.csv       # One row per learner — cohort characteristics and totals (revision 2)
  disruption_periods.csv           # Monthly aggregates — natural experiment data (revision 2)
  data_dictionary.md               # Variable definitions for all three files
  README.md                        # This file
  export_research_data.sql         # SQL that generates all three CSVs from the database (revision 2)
  archive-v1-april-2026-export/    # The files as first exported in April 2026, kept unchanged
```

---

## Revision 2 (October 2026): what changed and why

The three CSV files were regenerated from the database on 8 October 2026. The April 2026 files are kept in `archive-v1-april-2026-export/` so that anything computed from them can still be reproduced.

**The platform was counting activities that learners never opened.** Until October 2026 the application created a dashboard row for every grade-appropriate module when a learner signed up. Those placeholder rows (31,912 of the 37,481 rows in the table, 85%) were counted as "sessions started", which is what `total_activities_started`, `session_count` and the session bands were built from. In the April export 62 of 88 learners fell in the top band (Core, 50+), with a median of 136 activities started but a median of 0 completed.

What revision 2 does differently:

| | April 2026 export | Revision 2 |
|---|---|---|
| What counts as a session | Every dashboard row, including rows created in advance | A row where the learner started or completed something, has a chat, or holds work |
| Date of a session | When the row was created (the signup date for pre-created rows) | The first chat message (completions: the last message) |
| Who is included | Every account with activity, including 14 accounts that are now staff | Approved student/learner accounts at the Oloibiri site only |
| Session bands | Emerging 1–10, Developing 11–25, Established 26–50, Core 50+ | Early <25, Developing 25–49, Established 50–99, Core 100+ |
| Anonymity rule | Documented as k=3; the platform code uses 5 | A learner-day or month is dropped when fewer than 5 learners are present |
| `is_persistent_learner` | Empty | Real sessions in 3 or more calendar months of the window |
| `artifact_*` fields | Empty | Still empty (not populated by the original pipeline either) |

Resulting files: **2,424 learner-day rows (60 learners), 62 learners in the cohort file, 9 months**. The April files held a 100-row daily panel and a 6-row monthly file (the documentation described 3,012 and 9), so they were partial extracts of the dataset described. The January 2026 daily rows are absent because fewer than 5 learners were present on any January date; January remains in `disruption_periods.csv`.

The assessment metrics (scaffolding, reasoning, capability scores, PUE and role signals) are **unchanged**: they come from the same monthly assessments, one per learner-month, repeated on each day of that month. Only the engagement counts, the dates, the population and the bands changed.

**Statements elsewhere in this README that the data do not support** (left as written; they need a decision from the authors):
- *Learner tokens "(e.g. `L001`–`L088`)"*: tokens are salted hashes of the account ID, 32 hexadecimal characters. The salt is visible in the platform's public source code, so treat tokens as pseudonymous rather than anonymous.
- *"88 unique learners"*: revision 2 has 62 learners. Of the 88 in the April file, 14 are accounts that are now staff, and others had only pre-created rows.
- *"All three [disruptions] produced near-zero community engagement"*: in neither export do sessions fall to near zero in the outage months. Revision 2 monthly sessions are 111 (Oct) and 98 (Nov) for the ISP outage against 33 in September and 86 in December; the April file showed 384 and 604.

---

## Deployment Context

Oloibiri is a community of approximately 8,000 residents in Bayelsa State, Nigeria — the site of Nigeria's first commercial oil well (1956) and a community whose productive capacity was systematically displaced by decades of oil extraction without corresponding investment in human capital. The community has access to solar electricity via a Renewvia Energy Africa microgrid but has lacked the human capability infrastructure necessary to convert that electricity into productive economic activity.

The Davidson AI Innovation Center (vAI) was established in June 2025 by community leader Bennywhite Davidson (co-author) with support from the University of Dayton research team. The center deployed the `nextvillage.community` platform — a React/TypeScript application with a Supabase backend and multi-provider AI routing — to deliver four integrated capability streams to community members with zero prior computer access:

- **English & Mathematics** — foundational literacy and numeracy
- **AI Proficiency & Digital Literacy** — AI literacy, prompt engineering, digital citizenship
- **Technical & Creative Skills** — coding, content creation, digital tools
- **Community Impact AI** — health navigation, agricultural consulting, enterprise development

The April 2026 export reported 88 unique learners; see Revision 2 above for why the regenerated files describe 62. Two learners are identified by name in the paper as longitudinal case studies — Silas Clergy (co-author, software developer) and Solomon Matthias Solomon (community health navigator) — with their explicit consent.

---

## Data Coverage Note

The lab launched in June 2025 and recorded first learner activity on July 15, 2025. The `dashboard_stats` table — the source for all three CSV files in this repository — was implemented in August 2025 as part of a platform hardening phase. June and July 2025 session records exist in the raw `dashboard` table in the Supabase backend but were not backfilled into `dashboard_stats`.

Researchers should note:
- **June–July 2025**: deployment and onboarding period; session data available from corresponding author on request
- **August 2025 – April 2026**: metrics available in this repository (2,424 learner-day records in revision 2)
- **Paper references to "11-month deployment"** span June 2025 – April 2026; quantitative analyses draw on the August 2025 – April 2026 window unless otherwise noted

---

## Anonymization Protocol

All three datasets were generated using the SQL in `export_research_data.sql` (revision 2; the April export came from `public.dashboard_stats`). Anonymization is applied in that query:

**Pseudonymization:** `learner_token` is a salted hash (MD5) of the Supabase account ID, in place of the raw `user_id` UUID. Tokens are stable across all three files and across revisions — the same learner has the same token everywhere. Re-identifying a learner requires their account ID, but because the salt appears in the platform's public source code, tokens are pseudonymous, not anonymous.

**K-anonymity suppression:** In revision 2 a learner-day row is dropped when fewer than 5 learners are present on that date, and a month is dropped from `disruption_periods.csv` when fewer than 5 learners were active in it. (This is the threshold the platform code uses; the April README said k=3.)

**Attribute binning:** `grade_band` (1-4, 5-8, 9-12) replaces raw grade level. No precise birthdates or ages are recorded in the platform.

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
- Assign session band from cumulative total (revision 2): Early (<25), Developing (25–49), Established (50–99), Core (100+)
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
