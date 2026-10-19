# Decision log

One line per decision that shapes the platform, newest first. Add the date, the decision, the reason, and who
decided. If a decision is reversed, add a new line; do not delete the old one.

| Date | Decision | Why | Decided by |
|---|---|---|---|
| 2026-10-17 | Adopt a written change process: propose, triage weekly, plan monthly, privacy and safety check, peer review, check results | One person was deciding everything; the team and the security advisor need shared ownership | Kevin Hallinan |
| 2026-10-16 | Public name is **nextVillage.community** (not "AI'ing & Vibing") | One clear name for families, partners and regulators | Kevin Hallinan |
| 2026-10-16 | The privacy contact is the child-protection lead, Confidence Onuoha; the Davidson AI Futures Lab has no street address | Parents without email need a local, reachable person | Kevin Hallinan |
| 2026-10-16 | Platform runs on the strictest applicable law for each country; new countries (Ghana) get their own legal review before children are enrolled | Laws differ and we do not assume | Kevin Hallinan |
| 2026-10-16 | A media-release-only parent form is not consent to use the platform; families sign the new form or the add-on | The old form did not cover the platform, AI vendors or US storage | Kevin Hallinan |
| 2026-10-16 | Every learner must enter a valid join code to complete sign-up; duplicate accounts are merged, not left | Learners with no group had no leader and no safety alerts; duplicates split children's records | Kevin Hallinan |
| 2026-10-16 | Partners pay AI usage cost (estimate US$0.20 to US$0.60 per active learner per day) and ideally modest mentoring support; no subscription fee | Keeps the platform free to start and sustainable | Kevin Hallinan |
| 2026-10-15 | Every learner under 18 needs guardian consent collected by the leader | Both African laws treat under-18s as children | Kevin Hallinan |
| 2026-10-14 | Do **not** exclude children under 13; give them a tight protected tier instead | Mission: reach young learners safely | Kevin Hallinan |
| 2026-10 | AI models: Claude Sonnet 5.5 only for the main path; no older Sonnet; free-tier vendors for 13 and over only | Safety, cost and consistency | Kevin Hallinan |
| 2026-10 | Remove OpenRouter, DeepSeek and Gemini from the AI chain; remove unused offline-sync functions | Fewer vendors that see children's text | Kevin Hallinan |
| 2026-10 | Focus is Africa first; AI legal review plus a pro-bono lawyer; no insurance purchased for now | Budget | Kevin Hallinan |
| 2026-10-18 | **Every evaluation uses the same model: Claude Sonnet 5.5 at medium effort** (challenge, grand challenge, winner selection, tie-break, tech skills, web session, certifications). Edge functions need deploying to take effect | Scores must be comparable across learners and over time; no OpenAI for grading | Kevin Hallinan |
| 2026-10-19 | **A child safety officer is required only for Davidson AI Futures Lab, Maji Mazuri and Open Mind Africa** (switch: `organizations.requires_safety_officer`); other organizations need none. Replaces the 18 Oct rule that every organization needs one. Maji Mazuri and Open Mind Africa are onboarding and name theirs now | Adult and campus groups have no children to protect; the three child-serving partners do | Kevin Hallinan |
| 2026-10-19 | **The monthly progress report is seen in the app by site leaders, teachers and facilitators, each only for their own organization** (page `/progress-report`; the database function `get_org_progress_report` enforces it). Platform administrators can pick any organization. The emailed version still goes only to people added as recipients | Leaders and teachers need to see how their learners are doing without a separate email list | Kevin Hallinan |
