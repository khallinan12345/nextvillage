# Runbook: Duplicate User Accounts

**Owner:** Silas Clergy  
**Escalate to:** Kevin Hallinan  
**Last updated:** June 2026  
**Location in repo:** `docs/runbooks/duplicate-user.md`

---

## When to use this runbook

- A learner says they can't find their progress / "it reset"
- A facilitator (Solomon or site leader) reports two accounts for the same person
- You spot two profiles with the same name in the admin panel
- A learner says they forgot their password and created a new account instead of resetting

---

## Step 1 — Confirm it's actually a duplicate

Run this in the Supabase SQL editor. Replace the name or email with the person in question:

```sql
SELECT id, name, email, is_active, created_at, updated_at, organization_id
FROM profiles
WHERE name ILIKE '%firstname lastname%'
   OR email ILIKE '%their_email%'
ORDER BY created_at;
```

**You're looking for:** two or more rows for the same real person.

If you only find one row, it's not a duplicate — stop here and investigate the original complaint differently (wrong password, wrong email, etc.).

---

## Step 2 — Decide which account to keep (the canonical)

Pick the account that is:
1. `is_active = true` — always prefer the active one
2. Most recently updated (`updated_at`) — has the most recent activity
3. Has the most complete profile (`profile_completed = true`)

**Write down both IDs before you do anything:**
- Canonical (keep): `_________________________________`
- Ghost (merge away): `_________________________________`

If you're unsure which to keep, **stop and ask Kevin**.

---

## Step 3 — Check what data the ghost account has

Before merging, see if the ghost account has any learning history worth knowing about:

```sql
SELECT 'monthly_assessments' AS tbl, COUNT(*) FROM user_monthly_assessments WHERE user_id = 'GHOST_ID'
UNION ALL
SELECT 'vibe_coding_sessions', COUNT(*) FROM vibe_coding_sessions WHERE user_id = 'GHOST_ID'
UNION ALL
SELECT 'tech_skills_progress', COUNT(*) FROM tech_skills_progress WHERE user_id = 'GHOST_ID'
UNION ALL
SELECT 'ai_playground_chats', COUNT(*) FROM ai_playground_chats WHERE user_id = 'GHOST_ID'
UNION ALL
SELECT 'challenge_enrollments', COUNT(*) FROM challenge_enrollments WHERE learner_id = 'GHOST_ID'
UNION ALL
SELECT 'community_impact_journal', COUNT(*) FROM community_impact_journal WHERE learner_id = 'GHOST_ID';
```

If all counts are 0, the ghost account has no data — safe to retire directly (skip to Step 5).

If counts are non-zero, the merge SQL in Step 4 will move that data to the canonical account.

---

## Step 4 — Run the merge

Open the Supabase SQL editor and run the following. **Replace both UUIDs with the real values from Step 2.**

```sql
BEGIN;

-- Repoint all learning data from ghost → canonical
UPDATE user_monthly_assessments   SET user_id    = 'CANONICAL_ID' WHERE user_id    = 'GHOST_ID';
UPDATE vibe_coding_sessions        SET user_id    = 'CANONICAL_ID' WHERE user_id    = 'GHOST_ID';
UPDATE ai_playground_chats         SET user_id    = 'CANONICAL_ID' WHERE user_id    = 'GHOST_ID';
UPDATE image_generations           SET user_id    = 'CANONICAL_ID' WHERE user_id    = 'GHOST_ID';
UPDATE video_generations           SET user_id    = 'CANONICAL_ID' WHERE user_id    = 'GHOST_ID';
UPDATE voice_generations           SET user_id    = 'CANONICAL_ID' WHERE user_id    = 'GHOST_ID';
UPDATE learning_modules            SET user_id    = 'CANONICAL_ID' WHERE user_id    = 'GHOST_ID';
UPDATE research_ai_sessions        SET user_id    = 'CANONICAL_ID' WHERE user_id    = 'GHOST_ID';
UPDATE research_findings           SET user_id    = 'CANONICAL_ID' WHERE user_id    = 'GHOST_ID';
UPDATE researcher_contributions    SET user_id    = 'CANONICAL_ID' WHERE user_id    = 'GHOST_ID';
UPDATE system_events               SET user_id    = 'CANONICAL_ID' WHERE user_id    = 'GHOST_ID';
UPDATE api_cost_log                SET user_id    = 'CANONICAL_ID' WHERE user_id    = 'GHOST_ID';
UPDATE weekly_challenge_projects   SET user_id    = 'CANONICAL_ID' WHERE user_id    = 'GHOST_ID';
UPDATE video_studio_projects       SET user_id    = 'CANONICAL_ID' WHERE user_id    = 'GHOST_ID';
UPDATE playground_context          SET user_id    = 'CANONICAL_ID' WHERE user_id    = 'GHOST_ID';
UPDATE community_impact_journal    SET learner_id = 'CANONICAL_ID' WHERE learner_id = 'GHOST_ID';
UPDATE community_impact_tiers      SET learner_id = 'CANONICAL_ID' WHERE learner_id = 'GHOST_ID';
UPDATE grand_challenge_submissions SET learner_id = 'CANONICAL_ID' WHERE learner_id = 'GHOST_ID';

-- Constrained tables: delete collisions first, then repoint remainder
DELETE FROM challenge_enrollments ce
  USING challenge_enrollments canon
  WHERE ce.learner_id = 'GHOST_ID'
    AND canon.learner_id = 'CANONICAL_ID'
    AND canon.challenge_id = ce.challenge_id;
UPDATE challenge_enrollments SET learner_id = 'CANONICAL_ID' WHERE learner_id = 'GHOST_ID';

DELETE FROM dashboard ghost
  USING dashboard canon
  WHERE ghost.user_id = 'GHOST_ID'
    AND canon.user_id = 'CANONICAL_ID'
    AND canon.learning_module_id = ghost.learning_module_id;
UPDATE dashboard SET user_id = 'CANONICAL_ID' WHERE user_id = 'GHOST_ID';

DELETE FROM tech_skills_progress ghost
  USING tech_skills_progress canon
  WHERE ghost.user_id = 'GHOST_ID'
    AND canon.user_id = 'CANONICAL_ID'
    AND canon.phase_id = ghost.phase_id
    AND canon.task_name = ghost.task_name;
UPDATE tech_skills_progress SET user_id = 'CANONICAL_ID' WHERE user_id = 'GHOST_ID';

DELETE FROM research_badges ghost
  USING research_badges canon
  WHERE ghost.user_id = 'GHOST_ID'
    AND canon.user_id = 'CANONICAL_ID'
    AND canon.phase_id = ghost.phase_id;
UPDATE research_badges SET user_id = 'CANONICAL_ID' WHERE user_id = 'GHOST_ID';

DELETE FROM researcher_phase_debriefs ghost
  USING researcher_phase_debriefs canon
  WHERE ghost.user_id = 'GHOST_ID'
    AND canon.user_id = 'CANONICAL_ID'
    AND canon.phase_id = ghost.phase_id;
UPDATE researcher_phase_debriefs SET user_id = 'CANONICAL_ID' WHERE user_id = 'GHOST_ID';

DELETE FROM researcher_contribution_summary ghost
  USING researcher_contribution_summary canon
  WHERE ghost.user_id = 'GHOST_ID'
    AND canon.user_id = 'CANONICAL_ID'
    AND canon.phase_id = ghost.phase_id;
UPDATE researcher_contribution_summary SET user_id = 'CANONICAL_ID' WHERE user_id = 'GHOST_ID';

-- user_personality_baseline: one row per user — just delete the ghost
DELETE FROM user_personality_baseline WHERE user_id = 'GHOST_ID';

-- Retire the ghost profile
UPDATE profiles
SET is_active = false, merged_into = 'CANONICAL_ID'
WHERE id = 'GHOST_ID';

-- Verify before committing — all should return 0
SELECT 'monthly_assessments' AS tbl, COUNT(*) AS remaining FROM user_monthly_assessments WHERE user_id = 'GHOST_ID'
UNION ALL SELECT 'dashboard', COUNT(*) FROM dashboard WHERE user_id = 'GHOST_ID'
UNION ALL SELECT 'challenge_enrollments', COUNT(*) FROM challenge_enrollments WHERE learner_id = 'GHOST_ID'
UNION ALL SELECT 'tech_skills_progress', COUNT(*) FROM tech_skills_progress WHERE user_id = 'GHOST_ID';

-- If all zeros above: uncomment and run COMMIT
-- COMMIT;

-- If anything looks wrong: run ROLLBACK instead
-- ROLLBACK;

---

## Step 5 — Notify the user

Send the learner a short message. Use this template (via Solomon or facilitator if no direct email access):

> Hi [Name],
>
> We noticed you had two accounts on nextvillage.community. We have merged them into one so all your learning progress is in one place.
>
> Going forward, please log in using: **[canonical email]**
>
> If you ever forget your password, click **"Forgot Password"** on the login page — do not create a new account.
>
> Your learning history is safe and unchanged.
>
> — The nextvillage team

If the ghost email was a typo (e.g. `@gmil.com`), make sure the learner knows their correct login email.

---

## Step 6 — Verify and log

After committing, confirm the merge worked:

```sql
SELECT id, name, email, is_active, merged_into
FROM profiles
WHERE id IN ('CANONICAL_ID', 'GHOST_ID');
```

Expected: canonical row has `is_active = true`, ghost row has `is_active = false` and `merged_into` set.

Then log what you did in the repo. Add a row to `docs/runbooks/merge-log.md`:

```
| Date | Ghost ID (first 8 chars) | Canonical ID (first 8 chars) | Name | Reason |
| 2026-06-09 | 40e9daa6 | 73da14c1 | Bennywhite Davidson | duplicate registration |
```

---

## When to escalate to Kevin

- You find 3+ accounts for the same person and can't tell which is canonical
- The ghost account has significantly more learning history than the canonical
- The learner disputes the merge ("that wasn't my account")
- Any SQL error you don't understand
- The learner is a site leader or facilitator (not just a student)

---

## Prevention

The platform now:
- Blocks exact-email duplicate signups at registration
- Warns on fuzzy matches (similar name or email) before creating a new account
- Shows "Forgot Password" on the login page

If duplicates keep appearing for the same person, check whether they're sharing a device and accidentally creating accounts for each other.
