# Runbook: Security or Privacy Incident

**Owner:** Kevin Hallinan  
**Last updated:** October 2026  
**Location in repo:** `docs/runbooks/incident-response.md`  
**Related:** `docs/DATA-MAP.md` (what we hold, who else sees it, how a person is erased)

Status: first version. Contacts marked **[fill in]** are not set up yet. A privacy attorney should
review the notification steps before we open in the US, UK or EU.

---

## What counts as an incident

Act on this runbook if any of these is true or suspected:

- Someone who should not have it can see learner data (a leaked key, a misconfigured table or bucket,
  a wrong-organization view, an exposed file link).
- An account was taken over, or an admin/leader account was misused.
- A student's code left the sandbox, or something in the platform attacked another user.
- A learner is at risk of harm (grooming, threats, self-harm) and a safety alert did not reach anyone.
- A vendor tells us they were breached (Supabase, Vercel, Anthropic, OpenAI, Replicate, Resend, E2B,
  the free-tier AI services).

If a child may be in immediate danger, **contact the learner's leader and local emergency help first**,
then come back to this runbook.

---

## First hour

1. **Write down the time and who found it.** Open a private note (or the incident log below) and
   keep adding to it. Do not delete anything yet.
2. **Stop the bleeding** (pick what fits; each is reversible except key rotation):

   | Problem | Action |
   |---|---|
   | A secret was exposed (API key, service-role key, Resend, Replicate, Anthropic, OpenAI, E2B, GitHub token) | Rotate it at the vendor, update it in Vercel env vars (and in Supabase edge-function secrets if it is used there), redeploy. Keep the old key's last-used time for the log. |
   | A table or view is readable by the wrong people | Revoke per role in SQL: `REVOKE ALL ON public.<name> FROM anon, authenticated;` (revoking from `PUBLIC` is not enough on Supabase). Then fix the policy properly. |
   | A storage bucket or file link is exposed | Make the bucket private, or move the file. Signed links stay valid until they expire. |
   | One account is compromised | In Supabase Auth, sign the user out everywhere and force a password reset. For a leader or admin, also review what they changed (see "What to look at"). |
   | The platform itself is under attack | Vercel dashboard: turn on Attack Challenge Mode; add a Firewall rule to block the source. |
   | Something is actively harmful and cannot be fixed fast | Roll back the Vercel deployment to the last good one, or pause the affected feature. |

3. **Tell Kevin** (owner) if it is not already him. **[fill in: backup contact]**

---

## What to look at (preserve first, then read)

Take a copy of anything you may need before changing it (export the rows or save the log lines).

- **Vercel logs** (functions and requests): what ran, from where, around the time window.
- **Supabase logs** (API, Auth, Postgres, Edge Functions) in the dashboard.
- `system_events`: errors and safety events by `event_type` and `created_at`. Routine rows are purged
  after 180 days, safeguarding rows after 2 years, so pull what you need early.
- `together_safety_flags` and `system_events` rows named `safety_flag_*`: what was flagged and
  whether leaders were emailed (`notified` fields on the flag).
- `code_execution_log`: code runs, kept only 30 days. Pull it quickly if the issue is the sandbox.
- `api_cost_log`: unusual spikes can show a stolen AI key being used.
- Auth: recent sign-ins and password resets for the affected user(s).
- GitHub: recent merges and Dependabot/Actions activity if a supply-chain problem is suspected.

Questions to answer, and write down:

1. **What happened**, and is it still happening?
2. **Whose data** was involved: learners, teachers/leaders, or **non-users** (patients, farmers,
   clients entered by learners; see `DATA-MAP.md` section 1)?
3. **Which fields**: names and emails only, or learning work, chats, health or contact details?
4. **How many people**, and **are any children**? Check `profiles.birth_year` (year only; blank means
   we do not know yet).
5. **Which organization(s)** and which countries?
6. **Which vendors** were in the path?

---

## Decide how serious it is

| Level | Meaning | Examples |
|---|---|---|
| **Low** | No personal data left our control; contained quickly | A bug that never exposed a row; a key rotated before use |
| **Medium** | Personal data visible to the wrong signed-in users or briefly public, no sign of misuse | Wrong-org leaderboard rows; bucket listing |
| **High** | Personal data of children, health information, or credentials accessed or copied by an outside party, or a child put at risk | Stolen service key used; account takeover of a leader; grooming contact |

When unsure, treat it one level higher until you know more.

---

## Telling people (Medium and High)

Clocks start when we **become aware**, not when we finish investigating.

1. **The affected organization's leader(s)** first, by phone or message, in plain words: what happened,
   what we know, what we are doing, what they should tell families. **[fill in: contact list per org]**
   Current leadership notes are in the project memory; the Oloibiri leader is Divinegift Morris.
2. **Affected people or their parents/guardians**, through the leader, once we know whose data it was.
   Say what was involved, what to watch for (for example phishing, a changed password), and how to reach us.
3. **Regulators**, if the law applies and the level is High. Check the table and confirm with the attorney:

   | Where the person lives | Regulator | Usual deadline from awareness |
   |---|---|---|
   | Nigeria | NDPC (Nigeria Data Protection Commission) | 72 hours (NDPA 2023) |
   | Kenya | ODPC | 72 hours |
   | South Africa | Information Regulator (POPIA) | as soon as reasonably possible |
   | EU / UK (once we serve them) | the national authority (UK: ICO) | 72 hours |
   | US (once we serve them) | state attorneys general; the FTC where COPPA applies | state-specific; commonly 30-60 days |

4. **Vendors**: if it is their breach or their data, ask them for their incident reference and timeline in
   writing. Ask the same for anything we need them to delete.
5. **Funders or partners**, if our agreements require it. **[fill in: agreements to check]**

Keep messages factual. Do not guess at causes or blame in writing before we know.

---

## Fix, then prove it

1. Fix the cause (policy, code, permission, key), not just the symptom.
2. **Verify as the affected roles** (anonymous, a learner, a leader of another organization), the way we
   did for the leaderboard lockdown. A passing test on its own is not enough, and remember a view's
   functions are checked against the calling user.
3. Add a test or a check so it cannot quietly come back.
4. Ship through a PR into `main`, wait for checks, never bypass them. Apply database changes the normal
   way and confirm in production afterwards.

---

## Afterwards (within a week)

- Write a short, blameless summary: timeline, cause, who was affected, what we did, what we changed.
- Update `docs/DATA-MAP.md` if the picture of what we hold or who sees it changed.
- Update the security tracker and this runbook with anything we learned.
- If a child's safety was involved, review with the organization's leader whether anything in how
  learners report concerns should change.

---

## Incident log (copy this template)

```
Incident:           <short name>
Found:              <date/time UTC>, by <who>
Level:              Low / Medium / High
What happened:
Data involved:      <whose, which fields, how many, children?>
Contained at:       <date/time>
Told:               <leaders / families / regulators / vendors, with times>
Cause:
Fix (PR link):
Verified how:
Follow-ups:
```
