-- Follow-up to 20261005180000_lock_down_leaderboards.sql.
--
-- grand_challenge_leaderboard called org_id_for_join_code() directly to rank
-- entries per organization. Postgres checks functions used inside a view as
-- the person querying, and org_id_for_join_code is (deliberately) not
-- executable by signed-in users, so the view failed with "permission denied
-- for function org_id_for_join_code".
--
-- Fix: a small helper that runs as owner and only answers for learners the
-- viewer is allowed to see on a leaderboard, and use it in the view.

CREATE OR REPLACE FUNCTION public.leaderboard_org_id(p_learner uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN can_see_leaderboard_entry(p_learner)
              THEN coalesce(p.organization_id, org_id_for_join_code(p.join_code_used))
         END
  FROM profiles p
  WHERE p.id = p_learner;
$$;

REVOKE ALL ON FUNCTION public.leaderboard_org_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leaderboard_org_id(uuid) TO authenticated, service_role;

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
    public.short_display_name(p.name) AS learner_name,
    p.avatar_url,
    row_number() OVER (
      PARTITION BY public.leaderboard_org_id(g.learner_id), g.quarter
      ORDER BY trm.tier_rank DESC NULLS LAST, g.journal_entry_count DESC, g.weeks_documented DESC, g.submitted_at
    ) AS rank
   FROM grand_challenge_submissions g
     LEFT JOIN tier_rank_map trm ON trm.tier = g.tier_awarded
     JOIN profiles p ON p.id = g.learner_id
  WHERE g.status = ANY (ARRAY['submitted'::text, 'evaluated'::text, 'awarded'::text])
    AND can_see_leaderboard_entry(g.learner_id);
