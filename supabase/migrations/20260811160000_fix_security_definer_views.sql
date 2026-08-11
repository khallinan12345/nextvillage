-- 31 views were flagged by the Advisor as SECURITY DEFINER (Postgres views
-- default to executing as their owner — here, the superuser-ish `postgres`
-- role — rather than as the querying user, unless `security_invoker = true`
-- is set). Combined with this schema's default privilege grant of full
-- SELECT/INSERT/UPDATE/DELETE/... on every new relation to `anon` and
-- `authenticated` (the same gap found and fixed for public.profiles),
-- **every one of these 31 views was fully readable by anyone holding the
-- public anon key** — including several exposing real PII with zero
-- per-user scoping: patient names/phone/village/health-triage
-- (health_patient_summary, health_open_followups), farmer/client
-- names/phone/village across four other consultant domains, and a
-- financial ledger (enterprise_ledger_admin) with learner names attached.
--
-- Verified each view's base tables already carry correct RLS (own-row via
-- youth_user_id/user_id = auth.uid(), plus an explicit admin/leader bypass
-- policy on every one of the five consultation tables) before choosing a
-- fix per view, in three groups:
--
-- GROUP 1 — `security_invoker = true`. The view's base tables already
-- enforce exactly the right access (own row, or an admin/leader/org-scoped
-- bypass policy) — flipping to invoker mode makes the view respect that
-- automatically, with no application code changes and no loss of
-- functionality for any legitimate caller (verified against every current
-- client-side usage of each view name).
--
-- GROUP 2 — stays SECURITY DEFINER (a straight invoker flip would break it:
-- these join `profiles`, whose RLS restricts a plain viewer to their own
-- row, blanking out every other student's name/avatar on a leaderboard that
-- is supposed to show everyone in the class/challenge/org). Grants
-- tightened to `authenticated`-only, read-only — this data (name, avatar,
-- tier, rank; no email/phone) was already intended to be visible broadly to
-- signed-in users, it just should not have been open to `anon` or writable.
--
-- GROUP 3 — stays SECURITY DEFINER but access is revoked from both `anon`
-- and `authenticated` entirely. Zero current client-side usage found for
-- any of these (grepped the whole app) — they're either internal ops
-- monitoring (system_events-derived) or, per tutorial_progress_summary's
-- own migration comment, explicitly meant for a facilitator/admin role that
-- was never actually wired up. Locking to service_role/postgres now is free
-- — nothing breaks — and safer than leaving them open on the assumption a
-- future admin page will need them (that page can get its own narrow grant
-- or RPC when it's built, same pattern as the profiles RPCs).
--
-- GROUP 4 — stays SECURITY DEFINER, keeps `anon` + `authenticated` read
-- access. These back PublicLandingPage.tsx's marketing stats, are shown to
-- signed-out visitors by design, and contain zero PII — pure aggregate
-- counts (their own source table, dashboard_stats, already deliberately
-- restricts direct access to research_lead/platform_administrator/
-- site_leader; these views exist specifically to expose a safe, aggregated,
-- k-anonymized slice of it publicly). Only the write grants get revoked.

-- ── Universal: none of these 31 views should ever be written to ──────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON
  "public"."health_patient_summary", "public"."health_open_followups",
  "public"."agriculture_farmer_summary", "public"."agriculture_open_followups",
  "public"."animal_husbandry_farmer_summary", "public"."animal_husbandry_open_followups",
  "public"."fishing_client_summary", "public"."fishing_open_followups",
  "public"."entrepreneurship_client_summary", "public"."enterprise_ledger_admin",
  "public"."tech_skills_progress_admin", "public"."org_summary",
  "public"."community_impact_resolutions", "public"."research_task_tree",
  "public"."research_findings_latest", "public"."researcher_dashboard",
  "public"."researcher_credential_eligibility", "public"."research_data_view",
  "public"."learner_journal_summary", "public"."cowork_eligible_users",
  "public"."community_leaderboard", "public"."current_challenge_leaderboard",
  "public"."grand_challenge_leaderboard",
  "public"."v_recent_errors", "public"."v_event_frequency",
  "public"."fallback_daily_summary", "public"."provider_health_24h",
  "public"."tutorial_progress_summary",
  "public"."dashboard_stats_public", "public"."dashboard_stats_alltime",
  "public"."dashboard_activity_streams"
FROM "anon", "authenticated";

-- ── Group 1: base tables already scope correctly — switch to invoker ─────
ALTER VIEW "public"."health_patient_summary" SET (security_invoker = true);
ALTER VIEW "public"."health_open_followups" SET (security_invoker = true);
ALTER VIEW "public"."agriculture_farmer_summary" SET (security_invoker = true);
ALTER VIEW "public"."agriculture_open_followups" SET (security_invoker = true);
ALTER VIEW "public"."animal_husbandry_farmer_summary" SET (security_invoker = true);
ALTER VIEW "public"."animal_husbandry_open_followups" SET (security_invoker = true);
ALTER VIEW "public"."fishing_client_summary" SET (security_invoker = true);
ALTER VIEW "public"."fishing_open_followups" SET (security_invoker = true);
ALTER VIEW "public"."entrepreneurship_client_summary" SET (security_invoker = true);
ALTER VIEW "public"."enterprise_ledger_admin" SET (security_invoker = true);
ALTER VIEW "public"."tech_skills_progress_admin" SET (security_invoker = true);
ALTER VIEW "public"."org_summary" SET (security_invoker = true);
ALTER VIEW "public"."community_impact_resolutions" SET (security_invoker = true);
ALTER VIEW "public"."research_task_tree" SET (security_invoker = true);
ALTER VIEW "public"."research_findings_latest" SET (security_invoker = true);
ALTER VIEW "public"."researcher_dashboard" SET (security_invoker = true);
ALTER VIEW "public"."researcher_credential_eligibility" SET (security_invoker = true);
ALTER VIEW "public"."research_data_view" SET (security_invoker = true);
ALTER VIEW "public"."learner_journal_summary" SET (security_invoker = true);
ALTER VIEW "public"."cowork_eligible_users" SET (security_invoker = true);

REVOKE SELECT ON
  "public"."health_patient_summary", "public"."health_open_followups",
  "public"."agriculture_farmer_summary", "public"."agriculture_open_followups",
  "public"."animal_husbandry_farmer_summary", "public"."animal_husbandry_open_followups",
  "public"."fishing_client_summary", "public"."fishing_open_followups",
  "public"."entrepreneurship_client_summary", "public"."enterprise_ledger_admin",
  "public"."tech_skills_progress_admin", "public"."org_summary",
  "public"."community_impact_resolutions", "public"."research_task_tree",
  "public"."research_findings_latest", "public"."researcher_dashboard",
  "public"."researcher_credential_eligibility", "public"."research_data_view",
  "public"."learner_journal_summary", "public"."cowork_eligible_users"
FROM "anon";

-- ── Group 2: leaderboards — keep definer, authenticated-only read ────────
REVOKE SELECT ON
  "public"."community_leaderboard", "public"."current_challenge_leaderboard",
  "public"."grand_challenge_leaderboard"
FROM "anon";

-- ── Group 3: internal/unused — lock out anon and authenticated both ──────
REVOKE SELECT ON
  "public"."v_recent_errors", "public"."v_event_frequency",
  "public"."fallback_daily_summary", "public"."provider_health_24h",
  "public"."tutorial_progress_summary"
FROM "anon", "authenticated";

-- ── Group 4: public landing-page marketing stats — leave anon read as-is ─
-- (only the universal write-grant revoke above applies to this group)
