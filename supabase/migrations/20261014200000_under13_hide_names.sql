-- Under-13 tier, step 1: other learners never see a young learner's name or photo.
--
-- "Young" = a student whose birth year says they could be under 13 (year only, so we err toward
-- the younger reading), OR a student with no birth year yet who belongs to an organization whose
-- minimum learner age is below 13 (Kevin's default, 2026-10-14: treat them as young until they
-- answer the birth-year prompt). Leaders, teachers and administrators are never "young".
--
-- What changes for what a viewer sees:
--   * a student viewing a young learner     -> "Learner 4821" (stable per learner), no photo
--   * a leader/teacher/admin viewing them   -> the usual "First L." and photo
--   * anyone viewing themselves             -> the usual "First L." and photo
-- Applies to the three leaderboard views, get_cohort_member_names(), and the weekly-champion /
-- challenge-winner names (which also appear on the public landing page).

-- 1) Who is young. Private: not callable by signed-in users, so it cannot be used to look up
--    other people's age bracket. Only the SECURITY DEFINER helpers below call it.
CREATE OR REPLACE FUNCTION public.is_young_learner(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((
    SELECT p.role::text = 'student'
       AND CASE
             WHEN p.birth_year IS NOT NULL
               THEN p.birth_year >= extract(year FROM now())::int - 13
             ELSE coalesce((SELECT o.learner_age_min < 13
                              FROM organizations o
                             WHERE o.id = p.organization_id), false)
           END
    FROM profiles p
    WHERE p.id = p_user
  ), false);
$$;
REVOKE ALL ON FUNCTION public.is_young_learner(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.learner_pseudonym(p_learner uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$ SELECT 'Learner ' || (abs(hashtext(p_learner::text)) % 9000 + 1000)::text; $$;
REVOKE ALL ON FUNCTION public.learner_pseudonym(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.learner_pseudonym(uuid) TO authenticated, service_role;

-- 2) Should THIS viewer be shown a masked version of that learner?
CREATE OR REPLACE FUNCTION public.mask_learner_for_viewer(p_learner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_learner IS DISTINCT FROM auth.uid()
     AND public.is_young_learner(p_learner)
     AND coalesce((SELECT v.role::text FROM profiles v WHERE v.id = auth.uid()), 'student') = 'student';
$$;
REVOKE ALL ON FUNCTION public.mask_learner_for_viewer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mask_learner_for_viewer(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.public_display_name(p_learner uuid, p_full_name text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN public.mask_learner_for_viewer(p_learner)
              THEN public.learner_pseudonym(p_learner)
              ELSE public.short_display_name(p_full_name) END;
$$;
REVOKE ALL ON FUNCTION public.public_display_name(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.public_display_name(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.public_avatar_url(p_learner uuid, p_url text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$ SELECT CASE WHEN public.mask_learner_for_viewer(p_learner) THEN NULL ELSE p_url END; $$;
REVOKE ALL ON FUNCTION public.public_avatar_url(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.public_avatar_url(uuid, text) TO authenticated, service_role;

-- 3) The three leaderboard views (definitions as in production, with the name and photo swapped).
CREATE OR REPLACE VIEW public.community_leaderboard AS
 WITH tier_rank_map(tier, tier_rank, tier_label) AS (
         VALUES ('seed'::text,1,'community teacher'::text), ('scout'::text,2,'problem finder'::text), ('bridge'::text,3,'community connector'::text), ('builder'::text,4,'AI for good'::text), ('multiplier'::text,5,'village leader'::text)
        ), learner_counts AS (
         SELECT cit.learner_id,
            cit.org_id,
            cit.tier,
            trm_1.tier_rank,
            trm_1.tier_label,
            (count(*))::integer AS tier_count,
            max(cit.awarded_at) AS last_awarded_at
           FROM (community_impact_tiers cit
             JOIN tier_rank_map trm_1 ON ((trm_1.tier = cit.tier)))
          GROUP BY cit.learner_id, cit.org_id, cit.tier, trm_1.tier_rank, trm_1.tier_label
        ), learner_summary AS (
         SELECT learner_counts.learner_id,
            learner_counts.org_id,
            max(learner_counts.tier_rank) AS best_tier_rank,
            (sum(learner_counts.tier_count))::integer AS total_actions,
            max(learner_counts.last_awarded_at) AS last_action_at
           FROM learner_counts
          GROUP BY learner_counts.learner_id, learner_counts.org_id
        )
 SELECT ls.learner_id,
    ls.org_id,
    public_display_name(p.id, p.name) AS name,
    public_avatar_url(p.id, p.avatar_url) AS avatar_url,
    trm.tier AS highest_tier,
    trm.tier_label AS highest_tier_label,
    ls.total_actions,
    ls.last_action_at,
    COALESCE(( SELECT lc.tier_count
           FROM learner_counts lc
          WHERE ((lc.learner_id = ls.learner_id) AND (lc.org_id = ls.org_id) AND (lc.tier = 'seed'::text))), 0) AS seed_count,
    COALESCE(( SELECT lc.tier_count
           FROM learner_counts lc
          WHERE ((lc.learner_id = ls.learner_id) AND (lc.org_id = ls.org_id) AND (lc.tier = 'scout'::text))), 0) AS scout_count,
    COALESCE(( SELECT lc.tier_count
           FROM learner_counts lc
          WHERE ((lc.learner_id = ls.learner_id) AND (lc.org_id = ls.org_id) AND (lc.tier = 'bridge'::text))), 0) AS bridge_count,
    COALESCE(( SELECT lc.tier_count
           FROM learner_counts lc
          WHERE ((lc.learner_id = ls.learner_id) AND (lc.org_id = ls.org_id) AND (lc.tier = 'builder'::text))), 0) AS builder_count,
    COALESCE(( SELECT lc.tier_count
           FROM learner_counts lc
          WHERE ((lc.learner_id = ls.learner_id) AND (lc.org_id = ls.org_id) AND (lc.tier = 'multiplier'::text))), 0) AS multiplier_count,
    row_number() OVER (PARTITION BY ls.org_id ORDER BY ls.best_tier_rank DESC, ls.total_actions DESC, ls.last_action_at DESC) AS rank
   FROM ((learner_summary ls
     JOIN tier_rank_map trm ON ((trm.tier_rank = ls.best_tier_rank)))
     JOIN profiles p ON ((p.id = ls.learner_id)))
  WHERE ((p.role = 'student'::user_role) AND can_see_leaderboard_entry(ls.learner_id));

CREATE OR REPLACE VIEW public.current_challenge_leaderboard AS
 SELECT ce.challenge_id,
    ce.learner_id,
    ce.org_id,
    public_display_name(p.id, p.name) AS name,
    public_avatar_url(p.id, p.avatar_url) AS avatar_url,
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
    row_number() OVER (PARTITION BY ce.challenge_id ORDER BY
        CASE ce.tier_awarded
            WHEN 'multiplier'::text THEN 5
            WHEN 'builder'::text THEN 4
            WHEN 'bridge'::text THEN 3
            WHEN 'scout'::text THEN 2
            WHEN 'seed'::text THEN 1
            ELSE 0
        END DESC, ce.awarded_at, ce.submitted_at) AS rank
   FROM (challenge_enrollments ce
     JOIN profiles p ON ((p.id = ce.learner_id)))
  WHERE ((ce.tier_awarded IS NOT NULL) AND can_see_leaderboard_entry(ce.learner_id));

CREATE OR REPLACE VIEW public.grand_challenge_leaderboard AS
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
    public_display_name(p.id, p.name) AS learner_name,
    public_avatar_url(p.id, p.avatar_url) AS avatar_url,
    row_number() OVER (PARTITION BY (leaderboard_org_id(g.learner_id)), g.quarter ORDER BY trm.tier_rank DESC NULLS LAST, g.journal_entry_count DESC, g.weeks_documented DESC, g.submitted_at) AS rank
   FROM ((grand_challenge_submissions g
     LEFT JOIN tier_rank_map trm ON ((trm.tier = g.tier_awarded)))
     JOIN profiles p ON ((p.id = g.learner_id)))
  WHERE ((g.status = ANY (ARRAY['submitted'::text, 'evaluated'::text, 'awarded'::text])) AND can_see_leaderboard_entry(g.learner_id));

-- 4) Cohort member names (used by the dashboard).
CREATE OR REPLACE FUNCTION public.get_cohort_member_names(p_join_code text)
 RETURNS TABLE(id uuid, name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, public.public_display_name(p.id, p.name)
  FROM profiles p
  WHERE p.join_code_used = p_join_code
    AND p.role = 'student'
    AND p.membership_status = 'approved'
    AND (
      (SELECT role FROM get_my_profile()) = 'platform_administrator'
      OR org_id_for_join_code(p_join_code) = (SELECT organization_id FROM get_my_effective_profile())
    );
$function$;

-- 5) Weekly champions and challenge winners are shown to everyone, including logged-out visitors
--    on the landing page, so mask the stored name for young learners at write time.
CREATE OR REPLACE FUNCTION public.mask_young_champion_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_TABLE_NAME = 'weekly_champions' THEN
    IF public.is_young_learner(NEW.champion_user_id) THEN
      NEW.champion_name := public.learner_pseudonym(NEW.champion_user_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'community_challenges' THEN
    IF NEW.winner_id IS NOT NULL AND public.is_young_learner(NEW.winner_id) THEN
      NEW.winner_name := public.learner_pseudonym(NEW.winner_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.mask_young_champion_name() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS mask_young_champion_name ON public.weekly_champions;
CREATE TRIGGER mask_young_champion_name
  BEFORE INSERT OR UPDATE OF champion_name, champion_user_id ON public.weekly_champions
  FOR EACH ROW EXECUTE FUNCTION public.mask_young_champion_name();

DROP TRIGGER IF EXISTS mask_young_champion_name ON public.community_challenges;
CREATE TRIGGER mask_young_champion_name
  BEFORE INSERT OR UPDATE OF winner_name, winner_id ON public.community_challenges
  FOR EACH ROW EXECUTE FUNCTION public.mask_young_champion_name();

-- Existing rows. (A no-op UPDATE of the same column fires the trigger.)
UPDATE public.weekly_champions SET champion_name = champion_name WHERE champion_user_id IS NOT NULL;
UPDATE public.community_challenges SET winner_name = winner_name WHERE winner_id IS NOT NULL;
