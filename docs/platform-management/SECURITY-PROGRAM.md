# Information security program

**Version 1, 16 October 2026.** The US COPPA Rule requires a **written** security program (16 CFR
312.8(b)): a designated coordinator, a risk assessment at least annually, safeguards matched to the risk,
regular testing and monitoring, and an annual review; and (312.8(c)) written assurances from third parties
who receive children's data. Nigeria (NDPA s.24(1)(f), s.24(2)) and Kenya (s.41) require "appropriate
technical and organisational measures". This document is that program. It records what already exists
and sets the yearly cycle.

## 1. Who is responsible

| Role | Person | Duty |
|---|---|---|
| **Security coordinator** (312.8(b)(1)) | Kevin Hallinan (for vAI) | Owns this program; runs the annual assessment; signs off changes |
| **Local contact** | The organization leader (Oloibiri: Divinegift Morris) | Receives safety alerts; follows the incident runbook locally; keeps the paper consent forms safe |
| **Technical maintainer** | The person or tool making code changes (currently Kevin with Claude) | All production changes go through a reviewed pull request that must pass checks; no bypassing |

## 2. Safeguards in place (312.8(b)(3))

| Area | Controls |
|---|---|
| **Access** | Leader approval of every member; roles enforced in the database; users cannot change their own role or organization; privileged functions check the caller; join codes are private; sign-in required for AI routes |
| **Data protection** | Encrypted in transit and at rest (host-managed); personal details removed from AI text; under-13 tier; sensitive tables closed to ordinary users; storage listing closed |
| **Code and runtime** | Learner code runs in an isolated sandbox with rate limits; dependencies audited (0 known vulnerabilities, 16 Oct 2026) and updated weekly; database functions pinned to a fixed search path; secrets kept in host settings, not in code |
| **Vendors** | One AI vendor for under-13s; free-tier vendors only for 13 and over; vendor review (`VENDOR-REVIEW.md`); written assurances being collected (`VENDOR-DPA-CHECKLIST.md`) |
| **Detection** | Safety classifier and Together scanning; error and event logs (180 days; safety events 2 years); the Supabase security advisor and GitHub Dependabot alerts |
| **Retention** | Automatic deletion rules; inactive-account review; erasure script |
| **Response** | `runbooks/incident-response.md` with 72-hour regulator deadlines and a breach log |

## 3. Annual risk assessment (312.8(b)(2)) and testing (312.8(b)(4))

**Every October, and after any major change**, the coordinator completes this checklist and records the
result in section 5.

1. Re-run the Supabase security advisor; compare with `SECURITY-SCANNER-NOTES.md`; explain any new warning.
2. Confirm GitHub Dependabot alerts are on and `npm audit` shows no high or critical issue.
3. List every new table, function and vendor added in the year; confirm each has an access rule and is in `DATA-MAP.md`.
4. Sign in as each role (learner, under-13 learner, leader, administrator, a leader of another organization,
   signed out) and confirm each sees only what they should (leaderboards, rosters, files, consent records).
5. Send a test safety alert and confirm it reaches the leader and the backup address.
6. Review retention: confirm the nightly jobs ran, and check any table with no deletion rule.
7. Review vendor list and agreements; confirm no new vendor receives children's data without review.
8. Check leaders' access: remove people who left; confirm the administrator list.
9. Practise the incident runbook once (a 30-minute tabletop).
10. Review privacy requests: all answered within 14 days? Any pattern of complaints?

## 4. Third parties (312.8(c))

Before any new vendor receives learner data: read its data terms (training, retention, children), obtain a
written data processing agreement or equivalent assurance, add it to `VENDOR-REVIEW.md` and the privacy
notice, and confirm it is not reachable by children under 13 unless it is Anthropic-level vetted.

## 5. Review log

| Date | Done by | Result |
|---|---|---|
| 16 Oct 2026 | Kevin Hallinan with Claude | Scanner cleanup, dependency audit, role checks (leaderboards, rosters, consent), retention jobs verified, runbook updated. Open: vendor agreements, leader training, lawyer review |
