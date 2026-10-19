# nextVillage.community: administrator and leader operations manual

**For platform administrators, group leaders and child-protection contacts.** Version 1, 16 October 2026.
This manual says what to do, in order, for each routine job. Use it with the one-page leader guide, the
incident runbook, and the data security document. Nothing here contains passwords or keys; never write those
in a shared document.

## 1. Who does what

| Role | Who | Can do |
|---|---|---|
| **Learner** | A young person who joined with a join code | Uses the platform; sees only their own information (and, for older learners, group lists) |
| **Group leader / co-leader** ("site leader") | The lead mentor and helpers in an organization | Approves members, records parent consent, enters birth years, sees alerts and requests **for their own organization only** |
| **Child-protection contact** | A named adult in each organization | Follows up the same day on any safety alert; first person parents approach with a concern |
| **Platform administrator** | The platform team | Everything above across organizations, plus placing members with no group, merging duplicate accounts, and running deletions |

If you are unsure whether you may do something, ask the platform administrator before doing it.

## 2. A routine that keeps things healthy

| When | Do this | Where |
|---|---|---|
| **Every day lab is open** | Read safety alerts the same day. Check join requests. | Dashboard top cards |
| **Weekly** | Look at which learners went quiet. Answer privacy requests. Review the "no consent recorded" and "no birth year" cards. | Dashboard |
| **Monthly** | Read the monthly progress reports. Admin: check the "no group" and "possible duplicate accounts" cards. Confirm the nightly jobs ran (section 8). | Dashboard / reports |
| **Every quarter** | Review who has leader or administrator access; remove anyone who has left. | Admin dashboard |
| **Every October** | Run the yearly security checklist (see `SECURITY-PROGRAM.md`). | Security program |

## 3. The dashboard cards, one by one

The leader dashboard and the administrator student dashboard show these cards at the top. A card appears
only when there is something to do; an empty dashboard means you are caught up.

### 3.1 Safety flags
**What it is.** A message in a group room was flagged (a phone number, "WhatsApp me", an offer from abroad, a
money request, secrecy, or a member pressed Report). AI chat flags arrive by email as well.
**What to do.**
1. Read it the same day. It is automatic and can be wrong.
2. Talk to the learner **in person, kindly and casually** (see the leader guide). Do not say they were "flagged".
3. If the message shows possible harm, follow your local child-protection duty first and involve the parent or
   guardian and a local health worker.
4. If the message is unsafe for the room, press **Remove message**. Press **Mark reviewed** when handled.
5. Write down what you did and tell the platform administrator afterwards (a short message is enough).

### 3.2 Join requests (approve a new member)
**What it is.** People who signed up with your join code and are waiting for you.
**What to do.**
1. Approve only people you know and who are in the room or known to you. Press **Decline** for anyone else.
2. For anyone **under 18** you must first have the **signed parent or guardian consent form**. The platform will
   not approve them without your confirmation, and says how you obtained it.
3. **Approve all** is for a whole group in the room with you and needs a second click to confirm. It will not
   include learners who still need consent unless you use "Approve all under 18 with consent on file".

### 3.3 Learners under 18 without a recorded consent
**What it is.** Learners whose paper form you hold but whose consent is not yet recorded on the platform.
**What to do.**
1. Only record for learners whose **signed form covers using the platform and sending information abroad**
   (the new full form, or the old media form plus the one-page add-on). **A media-release-only form is not
   enough. Do not record it.**
2. Open the card. Tick the learners. Choose how you have it ("signed form", "in person", or "other" with a note).
3. Tick the confirmation sentence, then press **Record consent**.
4. Keep the paper original safely (section 6). Nobody loses access for lacking a record while this is under way.

### 3.4 Learners without a birth year
**What it is.** Learners with no birth year yet. Until it is known they get the younger-learner protections
if their group includes children.
**What to do.** Type the **year only** from the registration form beside each name and press **Save**. Never ask
for a full birthday.

### 3.5 Privacy requests
**What it is.** A learner (or parent) asked to delete their account and data, withdraw permission, or get a
copy. A parent may also tell you **in person**, by email or by WhatsApp (see section 4.2).
**What to do.**
1. If the request is to delete or withdraw, press **Lock account now** at once.
2. Tell the platform administrator the same day. Deletion is run by an administrator (section 4.3).
3. Reply to the family within **14 days** (7 for a copy). Enter a note and press **Mark done** when finished.

### 3.6 Inactive accounts
**What it is.** Accounts with no activity for 12 months.
**What to do.** For each, press **Keep**, or **Remove in 90 days**. Nothing is deleted without your decision, and
anyone who returns in time is taken off the list automatically. **Keep after all** reverses a removal.

### 3.7 (Administrators) People with no group
**What it is.** People who signed up without a valid join code, so no leader sees them or gets alerts about them.
Children are listed first.
**What to do.** Find out from the leader who they are, choose the right organization from the list, press **Place**.
If you cannot tell who a child is, ask the lead mentor before placing them.

### 3.8 (Administrators) Possible duplicate accounts
**What it is.** Two accounts that look like the same person (same name or a very similar email).
**What to do.** Read both sides. The newest account stays active; the older one's work moves onto it. Press
**Preview** to see how many records would move, then **Merge into newest**. If you are not sure they are the
same person, do not merge. Tell the learner which email to use afterwards and that, if they forget a password,
they use "Email me a link to reset my password" and never create a second account.

## 4. Step-by-step procedures

### 4.1 A new learner joins
1. Learner signs up with the join code (own email if possible).
2. Family signs the **full consent form** (Part A is required; Part B optional). The leader keeps the original.
3. The learner appears under Join requests. Confirm consent and press **Approve**.
4. Enter the birth year if it is missing. Record the consent if you hold the form but have not recorded it.
5. File the paper form (section 6).

### 4.2 A parent asks for something in person, by phone or WhatsApp
Many parents have no email. A request made in person or by message **is valid**.
1. Write down: date, learner's name, who asked, exactly what was asked.
2. If it is deletion or withdrawal, press **Lock account now** (privacy requests card) or ask the platform
   administrator to lock it.
3. Send the platform administrator a message the same day. The 14-day clock starts when the parent asked.
4. Tell the parent what will happen and when, then confirm when it is done.

### 4.3 Deleting a learner's account (administrators)
Use the project folder on a computer with the project set up (`.env.local` present).
1. Dry run first, to see what would be removed:
   `npm run user:delete -- someone@example.com`
2. If the list is right, run it for real:
   `npm run user:delete -- someone@example.com --confirm`
3. Leaders and administrators are refused unless you add `--allow-staff`; use that only on purpose.
4. Mark the privacy request done and tell the family. Deletion must finish within **30 days**.

### 4.4 Removing inactive accounts after a leader chose "remove" (administrators)
1. Dry run: `npm run accounts:purge-due`
2. Check the list. Then: `npm run accounts:purge-due -- --confirm`

### 4.5 A learner forgot their password or made a second account
1. Do not create anything new. On the sign-in page, press **Email me a link to reset my password** after typing
   the email.
2. If they already made a second account, check the duplicate-accounts card (3.8) and merge.

### 4.6 A lost or stolen device, or someone saw private information
1. Tell the platform administrator **within 24 hours**; faster is better. Speed matters (regulators expect a
   report within 72 hours).
2. Log out of the platform on the device if you can, and change the leader's password.
3. The administrator follows `runbooks/incident-response.md` and the breach log.

### 4.7 A new organization joins (administrators)
1. Agree and sign the **partnership agreement**; collect Schedule B (organization details) and Schedule C (costs).
2. The new site leader registers on the platform as a Teacher / Educator and chooses Register My Organization.
   They receive the **join code**.
3. Send the organization's logo, colors and community-context answers; ask the platform team to run the local
   tailoring of lessons once.
4. For a **new country**, check that country's data protection law and regulator first (for example Ghana)
   and adapt the parent forms. Do not enrol children before this is done.
5. Give leaders the leader guide and hold the training session. Name the child-protection contact.
6. Print the parent forms and begin collecting signatures before approving any learner under 18.

### 4.8 A leader or administrator joins or leaves the team
- **Joining:** they read this manual, sign the data handling commitment, and then receive access. Give access to
  the minimum needed.
- **Leaving:** remove their leader or administrator access the same day, change any shared logins they knew,
  and take back printed forms or devices holding learner information.

## 5. Things the platform does for you every night

These run automatically (times in UTC). Nobody needs to do anything, but know they exist.
- Delete old AI chat transcripts, group messages, pictures, audio and video past their retention period.
- Remove identifiers from health consultation records once finished.
- Flag accounts with 12 months of inactivity for a leader's decision.
- Delete old logs; safety-alert records are kept 2 years.
Media files are deleted at about 04:00, inactive-account flagging at about 04:15. If you think a job did not run,
tell the platform administrator.

## 6. Keeping paper consent forms safe
1. Keep originals in a locked box or cabinet; only leaders hold the key.
2. Keep a one-page list on top (learner name, date signed, which form).
3. Take a clear photo or scan of every form (all pages and the signature) and store the copies on a separate
   device or drive, **not in WhatsApp groups**.
4. Keep each form while the learner is on the platform and for a year after, then shred it.
5. If a parent withdraws permission, keep their withdrawal note with the form.

## 7. If something looks wrong

| Problem | First thing to try |
|---|---|
| A learner cannot sign in | They use "Email me a link to reset my password". If it still fails, ask the platform administrator. |
| A learner signed up but is not in the list | Check the join code they used; if none, they are in "People with no group" (3.7). |
| A learner's name shows as "Learner 1234" | They count as under 13 (birth year under 13 or unknown in a young group). Enter the birth year (3.4). |
| A safety email did not arrive | Check the dashboard card (3.1); tell the platform administrator, who checks the backup alert address. |
| A parent says "I never agreed to this" | Lock the account (4.2), find the form, tell the platform administrator before replying. |
| Two people share one login | Each learner needs their own account; ask them to create one with their own email and merge records if needed. |
| A page shows an error after an update | Tell the platform administrator; do not try to fix it yourself. |

## 8. Technical notes for administrators

- **Making changes.** Every change to the platform goes through a pull request into `main`, waits for the checks to
  pass, and is merged only when they are green. Never bypass the checks.
- **Database changes** are applied as migrations and then confirmed in production. Supabase gives every new
  table broad default access; revoke access for the anonymous and signed-in roles explicitly on every new table
  or function, and test as a learner, a leader of another organization, and a signed-out visitor.
- **Edge functions** are deployed with the Supabase command-line tool
  (`supabase functions deploy <name> --project-ref <ref> --use-api`).
- **Secrets** (API keys) live only in Vercel and Supabase settings. Never paste them in chat, tickets or code.
  If one is exposed, rotate it at once (see the incident runbook).
- **Code scanning and dependency alerts** are on in GitHub. Review new alerts weekly and merge security update
  pull requests.
- **Monthly assessment.** If a manual run is ever started and stops partway, its partial rows can block the
  next scheduled run; ask the technical maintainer before re-running.
- **Organization progress reports.** On the 4th of each month `/api/org-monthly-report` emails each
  organization's leaders a progress report for their own learners (scores, movement, sessions; nothing the
  children wrote). It sends only to people you add: `insert into report_recipients (report, email, name)
  values ('org_progress:<organization id>', 'leader@example.org', 'Name');`, and stops with
  `update report_recipients set active = false where email = '...';`. To check one first, call it with the
  cron secret and `?org=<id>&month=YYYY-MM&preview_to=you@example.org` (emails only you, marked PREVIEW);
  without `send=1` it sends nothing. `?force=1` resends a month already sent.
- **Costs.** AI usage is logged per request. Review the monthly total against each organization's agreed
  ceiling.

## 9. Records to keep

- The signed partnership agreement for each organization.
- The paper parent forms (section 6).
- The incident log (see the incident runbook), including near-misses.
- The merge log (the platform keeps one automatically) and a note of every deletion you ran.
- Minutes or attendance for each leader training session.
