# Leaders meeting: child safety, roles, change process, onboarding, continuity

Thursday 22 October 2026. About 105 minutes. Organizer: Kevin Hallinan.

**Goal:** leave with decisions and named owners, not just discussion.

## Agenda

| Time | Topic | Read ahead |
|---|---|---|
| 5 min | Welcome and goals | |
| 30 min | 1. Child safety | Leader guide (one page); `docs/child-protection/CHILD-SAFEGUARDING-POLICY.md`; `docs/onboarding/LEADER-TRAINING.md` |
| 20 min | 2. Roles | This page, section 2 |
| 20 min | 3. Change process | `docs/platform-management/CHANGE-PROCESS.md` |
| 10 min | 4. Onboarding new organizations | Community onboarding guide (www.nextvillage.community/docs/Community-Onboarding-Guide.html); `docs/templates/PARTNERSHIP-AGREEMENT.md` |
| 15 min | 5. Continuity plan | Backups for every role; the Oloibiri worksheet |
| 5 min | Decisions, owners and dates | |

## 1. Child safety (30 min)

The leader guide has five jobs for every leader:

1. Approve each new member yourself, and only if you know them. For anyone under 18, confirm a parent or guardian agreed.
2. Record the consent forms you hold, but only the right kind (it must cover using the platform and sending information abroad).
3. Enter missing birth years.
4. Read safety alerts the same day.
5. Answer privacy requests within 14 days (7 days for a copy of information), and press "Lock account now" first if a parent asks to close an account.

Child protection lead: Confidence Onuoha. Each partner organization names its own child safety contact.

Questions for the group:
- Does every organization have a named child safety contact and a way to reach them (WhatsApp, email)?
- Which leaders still hold forms that are not yet recorded on the platform?
- Has every leader read the guide, and has every leader done the leader training and signed the code of conduct?
- What happened the last time a safety alert arrived? What would make the response faster or kinder?
- What is hard about the privacy-request rules where you work (parents without email, requests made in person)?

## 2. Roles (20 min)

The platform has several leader-type roles, and each sees different things:

| Role | In practice |
|---|---|
| Site leader | Leads an organization or site; approves members; sees the dashboard and the monthly progress report |
| Leader | Same day-to-day work, used where leadership is shared (Maji Mazuri has three) |
| Teacher, facilitator | Work with learners; see the progress report for their own organization |
| Child safety officer | Required for Davidson AI Futures Lab, Maji Mazuri and Open Mind Africa |
| Platform administrator | Kevin and Randy; sees everything and approves sensitive changes |
| Platform administrator assistant | Silas Clergy; receives the safety and triage emails |

Questions for the group:
- Who in each organization should hold which role? Is anyone in the wrong one?
- Who approves new members at each organization, and who is their backup?
- Who receives the monthly progress report for each organization? (Currently Divinegift Morris, Bennywhite Davidson and Confidence Onuoha for Oloibiri; Daniel Shiraku Akoi, James Ndungu and Wickliffe Mwiti for Maji Mazuri.)
- What should happen to a helper's access when they leave?

## 3. Change process (20 min)

Summary of `CHANGE-PROCESS.md`:
- Anyone can propose a change: what problem, the smallest fix, whether it touches children's data, the cost, and how we will know it worked.
- Weekly triage (15 min): fix now, candidate, or not now with a reason.
- Monthly planning (45 min): score candidates; the decision depends on size (routine, significant, high-impact).
- Sensitive areas (database, API, privacy documents, the security program) need approval from Kevin or Randy before a change goes live.
- Urgent fixes (security, a child at risk, outage) can skip the queue but are recorded the same day.

Questions for the group:
- Where do you want to raise ideas: the Team workspace, WhatsApp, or the meeting?
- Is a weekly 15-minute triage and a monthly planning meeting realistic?
- What changes have you wanted that you did not know how to ask for?
- What should leaders be told about when something changes?

## 4. Onboarding new organizations (10 min)

Maji Mazuri tested the community onboarding guide and found it helpful. Open Mind Africa is being onboarded now.

Questions for the group:
- Where did Maji Mazuri's start go smoothly, and where did it get stuck?
- What should an organization have ready before enrolling children (partnership agreement, Schedule B, signed parent forms, safety officer named)?
- Who mentors a new organization in its first month?

## 5. Continuity plan (15 min)

The programme must keep running, and children must stay safe, when any one person is missing. Priority order: child safety (alerts reach a person who acts, the child protection lead can be reached); learners can sign in and learn; their data stays protected; leaders can run sessions (power, internet, computers); reports and certificates; improvements can pause.

Scenarios: short absence (up to 2 weeks), long absence (2 weeks to 3 months), permanent change, a platform outage, a local outage.

nextVillage and vAI own the platform. No single person is the owner.

Every critical role needs a primary and a named backup:

| Role | Primary | Backup |
|---|---|---|
| Lead | Bennywhite Davidson | To be named |
| Chief Technical Officer | Kevin Hallinan; Randy Hinders will take over as CTO in time | The security and technical advisor, once on the team |
| Grants and Partnership Leadership | Kevin Hallinan | To be named |
| Platform Administrator Assistant (safety and triage emails) | Silas Clergy | To be named; watched daily |
| Child protection lead, Educator | Confidence Onuoha | To be named at Oloibiri |
| Outreach Director, Educator, Proposal Writer, Oloibiri | Divinegift Morris | To be named at Oloibiri |
| Partner lead | Bennywhite Davidson | To be named |
| Finance (AI costs, hosting) | Kevin Hallinan | To be named |

A role with no backup is a risk to fix first. At least two trusted people should be able to reach every system (domain, GitHub, Vercel, Supabase, AI providers, email service, payments, monitoring). No passwords go in the plan.

If the platform is down: check whether it is the site, sign-in or the AI; tell learners and post a note in the lab; run the printed offline activities; the platform team checks hosting and database status and rolls back the last change if it caused the problem; record it in the incident and decision logs. A safety concern is handled under the safeguarding policy as normal, by phone or WhatsApp.

Questions for the Oloibiri team (the 12-question worksheet): who runs the lab if Divinegift is away; who backs up Confidence; power at night and on cloudy days; who holds and pays for the internet account and the backup; where the computers and spares are; where the signed consent forms are kept and copied; who can record consent and approve learners when the leader is away; offline activities; how families reach someone; how the Oloibiri team reaches the platform team, in order; local costs and late payment.

Next step: a 90-minute working session with Divinegift, Confidence and Bennywhite to complete the worksheet, name every backup, and plan the first drill within three months.

## Decisions to record

| Decision | Owner | By when |
|---|---|---|
| | | |
| | | |
| | | |

After the meeting, Kevin records the decisions in `docs/platform-management/DECISION-LOG.md`.

## Documents

All files are in the public repository. Base: https://github.com/khallinan12345/nextvillage/blob/main/docs/

**Child safety**
- [Leader guide](https://github.com/khallinan12345/nextvillage/blob/main/docs/onboarding/LEADER-GUIDE.md)
- [Child safeguarding policy](https://github.com/khallinan12345/nextvillage/blob/main/docs/child-protection/CHILD-SAFEGUARDING-POLICY.md)
- [AI safety and guardrails](https://github.com/khallinan12345/nextvillage/blob/main/docs/child-protection/AI-SAFETY-AND-GUARDRAILS.md)
- [Leader training and sign-off](https://github.com/khallinan12345/nextvillage/blob/main/docs/onboarding/LEADER-TRAINING.md)
- [Code of conduct](https://github.com/khallinan12345/nextvillage/blob/main/docs/templates/CODE-OF-CONDUCT.md)

**Forms**
- [Forms index](https://github.com/khallinan12345/nextvillage/blob/main/docs/forms/README.md)
- Parent consent form: [text](https://github.com/khallinan12345/nextvillage/blob/main/docs/templates/PARENT-CONSENT-FORM.md), [Word download](https://github.com/khallinan12345/nextvillage/raw/main/docs/forms/Parent%20consent%20form%20-%20full.docx)
- Parent consent add-on: [text](https://github.com/khallinan12345/nextvillage/blob/main/docs/templates/PARENT-CONSENT-ADDENDUM.md), [Word download](https://github.com/khallinan12345/nextvillage/raw/main/docs/forms/Parent%20consent%20add-on.docx)

**Privacy**
- [Learner privacy](https://github.com/khallinan12345/nextvillage/blob/main/docs/privacy-and-legal/LEARNER-PRIVACY.md)
- [Data handling commitment](https://github.com/khallinan12345/nextvillage/blob/main/docs/templates/DATA-HANDLING-COMMITMENT.md)

**Change process**
- [Change process](https://github.com/khallinan12345/nextvillage/blob/main/docs/platform-management/CHANGE-PROCESS.md)
- [Decision log](https://github.com/khallinan12345/nextvillage/blob/main/docs/platform-management/DECISION-LOG.md)
- [Security program](https://github.com/khallinan12345/nextvillage/blob/main/docs/platform-management/SECURITY-PROGRAM.md)

**Onboarding**
- [Onboarding guide](https://www.nextvillage.community/docs/Community-Onboarding-Guide.html) (live site)
- Partnership agreement: [text](https://github.com/khallinan12345/nextvillage/blob/main/docs/templates/PARTNERSHIP-AGREEMENT.md), [Word download](https://github.com/khallinan12345/nextvillage/raw/main/docs/forms/Partnership%20agreement.docx)
