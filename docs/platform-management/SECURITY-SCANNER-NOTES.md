# Security scanner notes

What the Supabase security advisor still reports after the 16 October 2026 cleanup, and why each item
is deliberate. **Do not "fix" these without reading the reason**: several would break the app or
expose data. Re-run the advisor after any database change and compare with this list.

## Fixed on 16 October 2026

- **41 functions with no fixed `search_path`** are now pinned to `public, pg_temp` (migration
  `20261016140000_function_search_path_hardening.sql`).
- `get_session_mix_by_stage()` was callable by anyone and used nowhere; access removed.

## Remaining warnings, and why

| Warning | Count | Why it is intentional |
|---|---|---|
| **Security definer views**: `community_leaderboard`, `current_challenge_leaderboard`, `grand_challenge_leaderboard` | 3 | They filter every row through `can_see_leaderboard_entry()` (same organization only) and show names through `public_display_name()` (under-13s appear as "Learner NNNN"). Switching to invoker views would make learners' own row-level rules decide what leaderboards show. |
| **Security definer views**: `dashboard_activity_streams`, `dashboard_stats_alltime`, `dashboard_stats_public` | 3 | Aggregate-only (counts and averages, no personal data). Shown on the public landing page. |
| **Tables with RLS enabled and no policies** | 12 | Server-only tables. No policy means no signed-in or signed-out user can read or write them; only the service role (our server code and scheduled jobs) can. Examples: `retention_job_secret`, `inactive_account_reviews`, `model_config`. |
| **Signed-out users can run security definer functions** | 4 | `get_headline_stats`, `get_session_band_stats`, `get_cohort_progress`: aggregate statistics shown on the public landing page. `check_email_exists`: used by the signup form (see "Accepted risk"). |
| **Signed-in users can run security definer functions** | 44 | App features that check who is asking before returning anything (leader and administrator tools, consent, privacy requests, safety reporting, the helper functions behind the leaderboards and row-level rules). They were reviewed individually in October 2026. New ones must verify `auth.uid()` and the caller's role inside the function. |

## Accepted risk

- **`check_email_exists(email)`** lets anyone ask whether an email already has an account. The signup
  form uses it to say "an account with this email exists, please sign in". The cost is that a person who
  knows someone's email can learn whether they use the platform. Removing it would stop that message and
  rely on the sign-in provider's own error. Left in place for usability; revisit if the platform moves to
  collecting less identifying signups or adds bot protection (for example a CAPTCHA) at signup.

## Outside the database

- **Code scanning (CodeQL)**, secret scanning with push protection, and Dependabot security updates are
  on (checked 24 October 2026). Dependency version updates (pull requests) run weekly.
- `npm audit`: 0 known vulnerabilities (16 October 2026). Secret scanning: 0 open alerts.

## Security advisor on pull requests (added 24 October 2026)

An advisory check, never a required one: it cannot block a merge. It reads what a pull request changes and
flags concerns for a person to look at. Rules are in `scripts/security/rules.mjs`:

| Rule | Looks for |
|---|---|
| `db-no-rls` | a new table without row-level security |
| `db-default-grants` | a new table, view or function not revoked from `anon` and `authenticated` |
| `db-definer-search-path` | a `SECURITY DEFINER` function with no fixed `search_path` |
| `db-definer-no-caller-check` | a `SECURITY DEFINER` function that app users can call and that never checks who is asking |
| `ai-temperature-claude` | `temperature` sent straight to Claude (newer models answer 400) |
| `api-no-auth` | an API route with no sign-in, cron secret or webhook secret |
| `api-trusts-body-id` | a user id taken from the request body or query |
| `secret-in-browser` | a server secret read from browser code or a `VITE_` variable |
| `log-student-content` | request bodies, prompts or messages written to logs |
| `new-external-host` | a call to an outside service that no code on `main` calls yet |

- **Locally:** `npm run security-check` (changed files vs `main`) or `npm run security-check -- --all --open`
  (whole repo; opens a readable report, which can be saved as PDF from the browser's print dialog).
- **On a pull request:** the workflow `security-advisor.yml` sends details to the Security tab and leaves one
  counts-only comment. The repository is public, so the comment and job summary never include file names or
  descriptions.
- **Deliberate exceptions:** put `security-check: ignore <rule-id> -- <reason>` in the file. Two API routes
  that are public on purpose (`notify-safety-flags`, `site-page`) already carry it.
- These are simple pattern checks. They miss things and sometimes flag something fine, and they do not
  replace the Supabase advisor or a person's review.
