-- Leaderboards: show only approved members of the viewer's own organization,
-- and only name, picture and progress.
--
-- Before this migration the three leaderboard views ran as their owner
-- (SECURITY DEFINER, so row-level security on the tables underneath did not
-- apply) and filtered nothing by viewer. Any signed-in account — including a
-- brand-new one waiting for approval, or a member of a different
-- organization — could read every row, across every organization:
--   * names and pictures of all learners,
--   * the free-text "action taken" / "impact observed" answers students
--     wrote for community challenges,
--   * the names of community members named in Grand Challenge stories.
-- Grand Challenge rows also carried inconsistent org values ('unassigned',
-- a slug, a uuid), so one leaderboard mixed several organizations, and
-- grand_challenge_submissions itself could be read in full by any signed-in
-- user (policy platform_reads_submissions).
--
-- After:
--   * A row is visible only when the learner is an approved member AND the
--     viewer is an approved member of the same organization (or a platform
--     administrator, or the learner themself). Pending/declined people are
--     neither listed nor allowed to look.
--   * impact_observed and community_member_name are no longer exposed by the
--     views (the app never displayed them). action_taken stays — it is the
--     one-line summary shown under each name on the weekly board.
--   * Grand Challenge ranks are computed per real organization, not per
--     inconsistent org_id text.
--   * Leaderboards show "First L." instead of a full name. The shortening
--     happens here, in the views and the cohort-names function, so the full
--     name never leaves the database for a leaderboard.
--   * anon has no access; authenticated and service_role keep SELECT only.
--   * Reading other people's rows straight from grand_challenge_submissions
--     is no longer allowed (learners still read their own).

-- ── 0. "First L." display name ────────────────────────────────────────────
-- 'Daniel Peace Azibaolari' -> 'Daniel A.'; one-word names stay as they are;
-- blank names become 'Member'.

CREATE OR REPLACE FUNCTION public.short_display_name(full_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN array_length(parts, 1) IS NULL THEN 'Member'
    WHEN array_length(parts, 1) = 1 THEN parts[1]
    ELSE parts[1] || ' ' || upper(left(parts[array_length(parts, 1)], 1)) || '.'
  END
  FROM (SELECT regexp_split_to_array(nullif(btrim(full_name), ''), '\s+') AS parts) s;
$$;

-- Functions inside a view run as the person querying, so they need EXECUTE.
REVOKE ALL ON FUNCTION public.short_display_name(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.short_display_name(text) TO authenticated, service_role;

-- ── 1. Who may see a given learner on a leaderboard ───────────────────────
-- Runs as owner so it can read profiles; keyed on auth.uid() inside, so the
-- answer depends on who is asking.

CREATE OR REPLACE FUNCTION public.can_see_leaderboard_entry(p_learner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles lp,
         get_my_effective_profile() me
    WHERE lp.id = p_learner
      AND lp.membership_status = 'approved'
      AND (
        p_learner = auth.uid()
        OR me.role = 'platform_administrator'
        OR (
          me.organization_id IS NOT NULL
          AND me.organization_id = coalesce(lp.organization_id, org_id_for_join_code(lp.join_code_used))
        )
      )
  );
$$;

-- Postgres checks a view's TABLES as the view owner but its FUNCTIONS as the
-- person querying, so signed-in users need EXECUTE for the views to work.
-- That exposes nothing new: it only answers "may I see this learner?" from
-- auth.uid(), which the views already reveal row by row. anon gets nothing.
REVOKE ALL ON FUNCTION public.can_see_leaderboard_entry(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_leaderboard_entry(uuid) TO authenticated, service_role;

-- ── 2. Community Impact leaderboard (same columns, adds the viewer filter) ─
-- CREATE OR REPLACE keeps the owner, grants and the INSTEAD OF DELETE trigger.

CREATE OR REPLACE VIEW public.community_leaderboard AS
 WITH tier_rank_map(tier, tier_rank, tier_label) AS (
         VALUES ('seed'::text,1,'community teacher'::text), ('scout'::text,2,'problem finder'::text), ('bridge'::text,3,'community connector'::text), ('builder'::text,4,'AI for good'::text), ('multiplier'::text,5,'village leader'::text)
        ), learner_counts AS (
         SELECT cit.learner_id,
            cit.org_id,
            cit.tier,
            trm_1.tier_rank,
            trm_1.tier_label,
            count(*)::integer AS tier_count,
            max(cit.awarded_at) AS last_awarded_at
           FROM community_impact_tiers cit
             JOIN tier_rank_map trm_1 ON trm_1.tier = cit.tier
          GROUP BY cit.learner_id, cit.org_id, cit.tier, trm_1.tier_rank, trm_1.tier_label
        ), learner_summary AS (
         SELECT learner_counts.learner_id,
            learner_counts.org_id,
            max(learner_counts.tier_rank) AS best_tier_rank,
            sum(learner_counts.tier_count)::integer AS total_actions,
            max(learner_counts.last_awarded_at) AS last_action_at
           FROM learner_counts
          GROUP BY learner_counts.learner_id, learner_counts.org_id
        )
 SELECT ls.learner_id,
    ls.org_id,
    public.short_display_name(p.name) AS name,
    p.avatar_url,
    trm.tier AS highest_tier,
    trm.tier_label AS highest_tier_label,
    ls.total_actions,
    ls.last_action_at,
    COALESCE(( SELECT lc.tier_count
           FROM learner_counts lc
          WHERE lc.learner_id = ls.learner_id AND lc.org_id = ls.org_id AND lc.tier = 'seed'::text), 0) AS seed_count,
    COALESCE(( SELECT lc.tier_count
           FROM learner_counts lc
          WHERE lc.learner_id = ls.learner_id AND lc.org_id = ls.org_id AND lc.tier = 'scout'::text), 0) AS scout_count,
    COALESCE(( SELECT lc.tier_count
           FROM learner_counts lc
          WHERE lc.learner_id = ls.learner_id AND lc.org_id = ls.org_id AND lc.tier = 'bridge'::text), 0) AS bridge_count,
    COALESCE(( SELECT lc.tier_count
           FROM learner_counts lc
          WHERE lc.learner_id = ls.learner_id AND lc.org_id = ls.org_id AND lc.tier = 'builder'::text), 0) AS builder_count,
    COALESCE(( SELECT lc.tier_count
           FROM learner_counts lc
          WHERE lc.learner_id = ls.learner_id AND lc.org_id = ls.org_id AND lc.tier = 'multiplier'::text), 0) AS multiplier_count,
    row_number() OVER (PARTITION BY ls.org_id ORDER BY ls.best_tier_rank DESC, ls.total_actions DESC, ls.last_action_at DESC) AS rank
   FROM learner_summary ls
     JOIN tier_rank_map trm ON trm.tier_rank = ls.best_tier_rank
     JOIN profiles p ON p.id = ls.learner_id
  WHERE p.role = 'student'::user_role
    AND can_see_leaderboard_entry(ls.learner_id);

-- ── 3. This week's challenge leaderboard (drops impact_observed) ──────────

DROP VIEW public.current_challenge_leaderboard;

CREATE VIEW public.current_challenge_leaderboard AS
 SELECT ce.challenge_id,
    ce.learner_id,
    ce.org_id,
    public.short_display_name(p.name) AS name,
    p.avatar_url,
    ce.tier_awarded,
        CASE ce.tier_awarded
            WHEN 'seed'::text THEN 'Community Teacher'::text
            WHEN 'scout'::text THEN 'Problem Finder'::text
            WHEN 'bridge'::text THEN 'Community Connector'::text
            WHEN 'builder'::text THEN 'AI for Good'::text
            WHEN 'multiplier'::text THEN 'Village Leader'::text
            ELSE NULL::text
        END AS tier_label,
    ce.status,
    ce.action_taken,
    ce.submitted_at,
    ce.awarded_at,
    row_number() OVER (PARTITION BY ce.challenge_id ORDER BY (
        CASE ce.tier_awarded
            WHEN 'multiplier'::text THEN 5
            WHEN 'builder'::text THEN 4
            WHEN 'bridge'::text THEN 3
            WHEN 'scout'::text THEN 2
            WHEN 'seed'::text THEN 1
            ELSE 0
        END) DESC, ce.awarded_at, ce.submitted_at) AS rank
   FROM challenge_enrollments ce
     JOIN profiles p ON p.id = ce.learner_id
  WHERE ce.tier_awarded IS NOT NULL
    AND can_see_leaderboard_entry(ce.learner_id);

COMMENT ON VIEW public.current_challenge_leaderboard IS
  'Leaderboard scoped to a single challenge_id — pass it via .eq(challenge_id, ...) from the client. Ranked by tier ordinal, tie-broken by awarded_at. Shows only approved members of the viewer''s own organization (see can_see_leaderboard_entry).';

-- ── 4. Grand Challenge leaderboard (drops community_member_name) ──────────

DROP VIEW public.grand_challenge_leaderboard;

CREATE VIEW public.grand_challenge_leaderboard AS
 WITH tier_rank_map(tier, tier_rank) AS (
         VALUES ('seed'::text,1), ('scout'::text,2), ('bridge'::text,3), ('builder'::text,4), ('multiplier'::text,5)
        )
 SELECT g.id,
    g.learner_id,
    g.org_id,
    g.quarter,
    g.title,
    g.community_impact_slug,
    g.journal_entry_count,
    g.weeks_documented,
    g.tier_awarded,
    trm.tier_rank,
    g.is_quarter_winner,
    g.status,
    g.submitted_at,
    public.short_display_name(p.name) AS learner_name,
    p.avatar_url,
    row_number() OVER (
      PARTITION BY coalesce(p.organization_id, org_id_for_join_code(p.join_code_used)), g.quarter
      ORDER BY trm.tier_rank DESC NULLS LAST, g.journal_entry_count DESC, g.weeks_documented DESC, g.submitted_at
    ) AS rank
   FROM grand_challenge_submissions g
     LEFT JOIN tier_rank_map trm ON trm.tier = g.tier_awarded
     JOIN profiles p ON p.id = g.learner_id
  WHERE g.status = ANY (ARRAY['submitted'::text, 'evaluated'::text, 'awarded'::text])
    AND can_see_leaderboard_entry(g.learner_id);

-- ── 5. Grants: authenticated + service_role read only; anon nothing ───────
-- New views are auto-granted to anon/authenticated by Supabase's default
-- privileges, so revoke per role explicitly rather than only from PUBLIC.

REVOKE ALL ON public.community_leaderboard,
              public.current_challenge_leaderboard,
              public.grand_challenge_leaderboard
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.community_leaderboard,
                public.current_challenge_leaderboard,
                public.grand_challenge_leaderboard
  TO authenticated, service_role;

-- ── 5b. Cohort leaderboard names: "First L." too ──────────────────────────
-- Same rules as before (approved students of the viewer's own org, or a
-- platform admin); only the name is shortened.

CREATE OR REPLACE FUNCTION public.get_cohort_member_names(p_join_code text)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, public.short_display_name(p.name)
  FROM profiles p
  WHERE p.join_code_used = p_join_code
    AND p.role = 'student'
    AND p.membership_status = 'approved'
    AND (
      (SELECT role FROM get_my_profile()) = 'platform_administrator'
      OR org_id_for_join_code(p_join_code) = (SELECT organization_id FROM get_my_effective_profile())
    );
$$;
REVOKE EXECUTE ON FUNCTION public.get_cohort_member_names(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_cohort_member_names(text) TO authenticated;

-- ── 6. Stop any signed-in user reading every Grand Challenge submission ───
-- (learners_own_submissions and service_manages_submissions remain.)

DROP POLICY IF EXISTS platform_reads_submissions ON public.grand_challenge_submissions;

-- ── 7. Remove a dead delete-through-the-view trigger ──────────────────────
-- It ran DELETE FROM profiles WHERE learner_id = ... (profiles has no
-- learner_id column, so it only ever errored). Nothing calls it, and a
-- "delete a leaderboard row, delete a profile" hook should not exist.

DROP TRIGGER IF EXISTS trigger_delete_leaderboard ON public.community_leaderboard;
DROP FUNCTION IF EXISTS public.delete_from_leaderboard_view();
