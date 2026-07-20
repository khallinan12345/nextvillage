-- The community challenge program (weekly challenges, weekly champion,
-- community impact tiers, and their leaderboards) only exists for
-- Davidson AI Futures Lab (org id a1b2c3d4-0001-0001-0001-000000000001).
-- These tables previously had USING (true) SELECT policies, meaning any
-- authenticated user of ANY organization could read every org's rows
-- directly via the Supabase client, regardless of what the app UI filtered
-- to. This migration closes that gap by restricting reads to members of
-- Davidson AI Futures Lab plus platform administrators.

-- ── community_challenges ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "anyone_reads_active_challenges" ON "public"."community_challenges";
DROP POLICY IF EXISTS "authenticated_reads_all_challenges" ON "public"."community_challenges";

CREATE POLICY "org_scoped_reads_challenges" ON "public"."community_challenges"
  FOR SELECT
  TO "authenticated"
  USING (
    (SELECT "get_my_profile"."role" FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'
    OR (SELECT "get_my_profile"."organization_id" FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'a1b2c3d4-0001-0001-0001-000000000001'
  );

-- ── challenge_enrollments ────────────────────────────────────────────────
-- "learners_own_enrollments" (own learner_id, all commands) is untouched —
-- every org's learner can still see/manage their own enrollment row.
DROP POLICY IF EXISTS "authenticated_reads_all_enrollments" ON "public"."challenge_enrollments";

CREATE POLICY "org_scoped_reads_enrollments" ON "public"."challenge_enrollments"
  FOR SELECT
  TO "authenticated"
  USING (
    (SELECT "get_my_profile"."role" FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'
    OR (SELECT "get_my_profile"."organization_id" FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'a1b2c3d4-0001-0001-0001-000000000001'
  );

-- ── community_impact_tiers ───────────────────────────────────────────────
-- "learners_read_own_tiers" (own learner_id) is untouched — every org's
-- learner can still see their own tier rows.
DROP POLICY IF EXISTS "platform_reads_all_tiers" ON "public"."community_impact_tiers";

CREATE POLICY "org_scoped_reads_tiers" ON "public"."community_impact_tiers"
  FOR SELECT
  TO "authenticated"
  USING (
    (SELECT "get_my_profile"."role" FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'
    OR (SELECT "get_my_profile"."organization_id" FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'a1b2c3d4-0001-0001-0001-000000000001'
  );

-- ── weekly_champions ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "weekly_champions_select_anon" ON "public"."weekly_champions";
DROP POLICY IF EXISTS "weekly_champions_select_auth" ON "public"."weekly_champions";

CREATE POLICY "org_scoped_reads_weekly_champions" ON "public"."weekly_champions"
  FOR SELECT
  TO "authenticated"
  USING (
    (SELECT "get_my_profile"."role" FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'platform_administrator'
    OR (SELECT "get_my_profile"."organization_id" FROM "public"."get_my_profile"() "get_my_profile"("role", "organization_id")) = 'a1b2c3d4-0001-0001-0001-000000000001'
  );
