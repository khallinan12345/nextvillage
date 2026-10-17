# How we decide what changes on the platform

**Purpose.** Until now every change to nextVillage.community was decided by one person, from experience,
reading and brainstorming. That worked while the platform was small. The platform now serves children in
several countries, so changes need a shared, written way to be proposed, weighed, approved, built and
checked, with the whole team owning the result. This document is that process. It is deliberately light:
the aim is better decisions and shared ownership, not paperwork.

Version 1, 17 October 2026. Review it after the first quarter.

## 1. Principles

1. **Children's safety and privacy come first.** A change that makes a child less safe or exposes their
   information does not ship, however useful it looks.
2. **Learners and leaders are the source of good ideas.** The best proposals come from what leaders and
   learners actually run into, not from what is fashionable.
3. **Evidence over opinion.** Every proposal says what problem it solves and how we will know it worked.
4. **Small, reversible steps.** Prefer a change we can try, measure and undo.
5. **Everyone can propose; named people decide.** Nobody needs permission to suggest. Decision rights are
   below.
6. **Write decisions down.** If it was worth deciding, it goes in the decision log so the next person does
   not have to ask why.

## 2. Where ideas come from

Treat all of these as inputs to the same list:

- **Leaders and learners:** what confused them, what broke, what they asked for (collected monthly).
- **Our own data:** usage and drop-off, monthly assessment results, AI cost log, error and safety logs.
- **Security and privacy:** the cybersecurity advisor's findings, the code scanner and dependency alerts,
  vendor notices, the annual security checklist, lawyer or regulator input.
- **Partners:** requests from new organizations (for example Ghana, Kenya), localization needs.
- **The team's own research:** articles, conferences, other programs. Fine as inputs, but they enter
  the list like everything else and are weighed the same way.

## 3. Step by step

### Step 1. Propose
Anyone on the team opens a **change proposal** (an issue in the GitHub project, using the template, or
sends it to the platform lead who files it). A proposal answers five questions:
1. What problem is this solving, for whom, and how do we know it is a problem?
2. What is the smallest change that would help?
3. Does it touch children's data, safety, AI behavior, consent, or access? (If yes, it needs a privacy and
   safety check in step 3.)
4. What will it cost in time and money (including AI cost)?
5. How will we know it worked?

### Step 2. Triage (weekly, 15 minutes)
The platform lead and a second team member look at new proposals once a week and put each in one lane:
- **Fix now:** broken, unsafe or a legal duty. Do it straight away, see "urgent" below.
- **Candidate:** worth weighing at the next planning meeting.
- **Not now / no:** say why, in one line, on the proposal. Nobody should wonder what happened.

### Step 3. Score and decide (monthly planning, 45 minutes)
The team scores each candidate on a simple 1 to 5 scale and talks through the top few:

| Question | Weight |
|---|---|
| **Benefit to learners** (learning, safety, access), backed by evidence | 3 |
| **Risk reduction** (security, privacy, legal, child safety) | 3 |
| **Benefit to leaders and partners** (less work, easier to scale) | 2 |
| **Effort** (low effort scores high) | 2 |
| **Cost to run** (low ongoing cost, including AI cost, scores high) | 1 |
| **Fit** with where we are heading this quarter | 1 |

The score informs the discussion; it does not replace judgment. A low-scoring item that protects children
can still go first.

**Who decides** depends on the size of the change:

| Tier | Examples | Decision |
|---|---|---|
| **A. Routine** | Wording, layout, small fixes, new lesson content, dependency updates | The platform lead approves; one other team member reviews the change |
| **B. Significant** | New feature, new AI vendor or model, change to scoring or assessment, new data collected, change to how groups or roles work | The planning meeting decides; privacy and safety check required; the security advisor reviews |
| **C. High-impact** | Anything affecting children's consent, public display of children, cross-border data flow, retention, a new country, anything the lawyer or regulators would care about | Planning meeting plus the security/privacy advisor **and** the child-protection contact sign off; update the DPIA and notice first |

### Step 4. Privacy and safety check (Tier B and C)
Before building, answer in the proposal: What new information is collected, and why is it needed? Who can see
it? How long is it kept? Does an AI vendor receive it, and is it cleaned first? Is it different for children
under 13? Does the parent form or privacy notice need to change? If anything is yes or unsure, the security
advisor reviews and the privacy documents are updated **with** the change, not after.

### Step 5. Build and review
- Work in a branch; open a **pull request** into `main` using the template. It states what changed, why, the
  tier, and the checklist.
- Automated checks (build, tests, code scanning) must pass. Never bypass them.
- **Another person reviews** every pull request before it merges (Tier B and C: the security advisor for
  anything touching access, data, AI or consent).
- Database changes are tested as a learner, a leader of another organization and a signed-out visitor.

### Step 6. Release and tell people
- Merge when the checks pass and the reviewer approves.
- Leaders are told about anything they will notice: a short note in the monthly leader update ("what
  changed and what you need to do").
- For Tier C, partners and families are told before it goes live.

### Step 7. Check it worked
At the next monthly meeting, for each shipped change, compare the result with the success measure written in
the proposal. Keep, adjust or undo. Record what we learned in the decision log.

## 4. Urgent changes

A security hole, a child at risk, an outage, or a legal deadline can skip the queue. The platform lead (or the
security advisor) may approve a fix on the spot. It still goes through a pull request and the checks, it is
recorded in the decision log the same day, and it is reviewed at the next meeting. If a breach is suspected,
follow the incident runbook first.

## 5. Roles

| Role | Does | Today |
|---|---|---|
| **Platform lead** | Owns the process, runs triage and planning, approves Tier A, final say if the team is split | Kevin Hallinan |
| **Security and privacy advisor** | Reviews Tier B and C, owns the security program and annual checklist, can stop an unsafe change | The cybersecurity advisor (joining the team) |
| **Child-protection contact(s)** | Signs off Tier C changes that affect children; brings leaders' concerns | Confidence Onuoha (Nigeria); one per partner organization |
| **Local leaders** | Bring needs from the lab; are told what changes | Divinegift Morris and other leaders |
| **Technical maintainer** | Builds and tests changes | Currently Kevin with Claude, plus whoever joins |
| **Partner representatives** | Propose changes for their community; invited to planning when their request is on the table | As partners join |

One person can hold more than one role while the team is small, but **nobody approves their own Tier B or C
change.**

## 6. Rhythm

| When | What |
|---|---|
| Weekly (15 min) | Triage new proposals; clear urgent items |
| Monthly (45 min) | Planning: score candidates, decide, review last month's results; leaders' feedback is the first item |
| Quarterly (1 hour) | Roadmap: where are we heading, what to stop doing, review this process, review security and privacy posture |
| Yearly (October) | Security checklist, vendor terms, DPIA review, partner agreements |

## 7. Definition of done

A change is done when: it works; checks pass; another person reviewed it; documentation and the privacy
notice are updated if needed; leaders were told; the success measure is written down for follow-up.

## 8. Where things live

- **Proposals and tasks:** the GitHub project / issues (template: "Change proposal").
- **Decisions:** `docs/DECISION-LOG.md`.
- **Code review:** pull requests (template in `.github/PULL_REQUEST_TEMPLATE.md`).
- **Security and privacy documents:** `docs/SECURITY-PROGRAM.md`, `docs/DPIA.md`, `docs/DATA-MAP.md`.
- **Compliance to-do list:** the shared compliance checklist.

## 9. Setting this up (first steps)

1. Agree this process with the team at the first meeting and edit anything that does not fit.
2. Add the security advisor as a repository collaborator and set GitHub to require **one approving review**
   on `main`, with a code-owner review for the sensitive areas (database migrations, authentication, AI
   routes, privacy pages and documents). See `.github/CODEOWNERS`.
3. Create a simple project board with the lanes: Proposed, Candidate, Planned, In progress, Shipped, Not now.
4. Hold the first planning meeting and seed the board from the compliance checklist, open questions from
   leaders, and the advisor's own list.
