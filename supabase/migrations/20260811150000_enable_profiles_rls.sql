-- public.profiles has had SELECT/INSERT/UPDATE/DELETE policies defined since
-- the baseline schema (profiles_select, profiles_update,
-- users_own_profile_insert) but RLS itself was never turned on for the
-- table — so those policies have never actually been enforced, and every
-- column of every user's profile (role, organization_id, email, grade_level,
-- join_code_used, ...) has been readable and writable by anyone holding the
-- public anon key, authenticated or not. This closes that gap.
--
-- A handful of legitimate product features relied on that gap by querying
-- `profiles` directly as the pre-auth `anon` role or across other users'
-- rows as plain `student` — neither of which the existing policies grant.
-- Rather than widen the policies (which would mean exposing full profile
-- rows to those callers), each gets a narrow SECURITY DEFINER RPC that
-- returns only the columns it actually needs.

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

-- Pre-auth signup: AuthForm.tsx's exact-email duplicate check
-- (src/components/auth/AuthForm.tsx, emailAlreadyExists).
CREATE OR REPLACE FUNCTION "public"."check_email_exists"("p_email" "text")
RETURNS boolean
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" = 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM "public"."profiles" WHERE "email" = "p_email");
$$;

REVOKE ALL ON FUNCTION "public"."check_email_exists"("text") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."check_email_exists"("text") TO "anon", "authenticated";

-- Pre-auth signup: duplicateDetection.ts's fuzzy-match candidate list
-- (src/lib/duplicateDetection.ts, findSimilarProfile). The Levenshtein/name
-- matching stays client-side in TypeScript — this just returns the same
-- (id, email, name) candidate rows the direct table query used to.
CREATE OR REPLACE FUNCTION "public"."find_similar_profile_candidates"(
  "p_organization_id" "uuid" DEFAULT NULL,
  "p_exclude_user_id" "uuid" DEFAULT NULL
)
RETURNS TABLE("id" "uuid", "email" "text", "name" "text")
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" = 'public'
AS $$
  SELECT "p"."id", "p"."email", "p"."name"
  FROM "public"."profiles" "p"
  WHERE "p"."is_active" = true
    AND ("p_organization_id" IS NULL OR "p"."organization_id" = "p_organization_id")
    AND ("p_exclude_user_id" IS NULL OR "p"."id" != "p_exclude_user_id");
$$;

REVOKE ALL ON FUNCTION "public"."find_similar_profile_candidates"("uuid", "uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."find_similar_profile_candidates"("uuid", "uuid") TO "anon", "authenticated";

-- Cohort leaderboard: DashboardPage.tsx shows a student their cohort-mates'
-- names by join_code_used, which profiles_select doesn't grant to a plain
-- 'student' (only own row, platform_administrator, or org-scoped
-- teacher/site_leader/facilitator/leader/research_lead).
CREATE OR REPLACE FUNCTION "public"."get_cohort_member_names"("p_join_code" "text")
RETURNS TABLE("id" "uuid", "name" "text")
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" = 'public'
AS $$
  SELECT "p"."id", "p"."name"
  FROM "public"."profiles" "p"
  WHERE "p"."join_code_used" = "p_join_code"
    AND "p"."role" = 'student';
$$;

REVOKE ALL ON FUNCTION "public"."get_cohort_member_names"("text") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_cohort_member_names"("text") TO "authenticated";

-- Org learner count: ProfilePage.tsx shows every member (not just leaders)
-- how many learners are in their org — same access gap as the leaderboard.
CREATE OR REPLACE FUNCTION "public"."get_organization_learner_count"("p_organization_id" "uuid")
RETURNS bigint
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" = 'public'
AS $$
  SELECT count(*)
  FROM "public"."profiles" "p"
  WHERE "p"."organization_id" = "p_organization_id"
    AND "p"."role" NOT IN ('site_leader', 'platform_administrator', 'research_lead');
$$;

REVOKE ALL ON FUNCTION "public"."get_organization_learner_count"("uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_organization_learner_count"("uuid") TO "authenticated";
