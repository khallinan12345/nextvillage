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

- GitHub **Dependabot alerts** are switched off for the repository, and **code scanning** is not set up.
  Both are toggled in the repository's Security settings. Dependency version updates (pull requests)
  already run weekly.
- `npm audit`: 0 known vulnerabilities (16 October 2026). Secret scanning: 0 open alerts.
