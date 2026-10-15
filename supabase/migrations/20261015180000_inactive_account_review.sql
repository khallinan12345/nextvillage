-- Inactive accounts (Kevin's rule, docs/DATA-MAP.md section 4): an account with no activity for
-- 12 months goes to a leader for review. Keep it, or schedule it for removal 90 days later. Nothing
-- is removed without a leader's (or administrator's) decision, and anyone who comes back in the
-- meantime drops off the list. The erasure itself is run by an administrator
-- (npm run accounts:purge-due, dry run by default), which also deletes the person's stored files.
--
-- "Activity" is the latest of: account creation, last sign-in, last session refresh (people who stay
-- signed in never "sign in" again), and the last change to their dashboard rows.

CREATE TABLE IF NOT EXISTS public.inactive_account_reviews (
  user_id         uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  flagged_at      timestamptz NOT NULL DEFAULT now(),
  last_active     timestamptz NOT NULL,
  decision        text CHECK (decision IN ('keep', 'remove')),
  decided_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at      timestamptz,
  remove_after    timestamptz
);
ALTER TABLE public.inactive_account_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inactive_account_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.inactive_account_reviews TO service_role;

CREATE OR REPLACE FUNCTION public.account_last_active(p_user uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT greatest(
    u.created_at,
    u.last_sign_in_at,
    (SELECT max(s.refreshed_at) FROM auth.sessions s WHERE s.user_id = u.id),
    (SELECT max(d.updated_at) FROM public.dashboard d WHERE d.user_id = u.id)
  )
  FROM auth.users u WHERE u.id = p_user;
$$;
REVOKE ALL ON FUNCTION public.account_last_active(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_last_active(uuid) TO service_role;

-- Nightly: drop people who came back, expire old "keep" decisions, flag newly inactive accounts.
CREATE OR REPLACE FUNCTION public.flag_inactive_accounts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM inactive_account_reviews r
   WHERE public.account_last_active(r.user_id) > r.flagged_at
      OR (r.decision = 'keep' AND r.decided_at < now() - interval '12 months');

  INSERT INTO inactive_account_reviews (user_id, organization_id, last_active)
  SELECT p.id, coalesce(p.organization_id, org_id_for_join_code(p.join_code_used)), a.last_active
    FROM profiles p
    CROSS JOIN LATERAL (SELECT public.account_last_active(p.id) AS last_active) a
   WHERE p.role::text <> 'platform_administrator'
     AND a.last_active < now() - interval '12 months'
  ON CONFLICT (user_id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.flag_inactive_accounts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flag_inactive_accounts() TO service_role;

-- What a leader (their organization) or administrator (everyone) sees.
CREATE OR REPLACE FUNCTION public.list_inactive_account_reviews()
RETURNS TABLE(user_id uuid, learner_name text, learner_email text, role text, organization_name text,
              last_active timestamptz, decision text, remove_after timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.user_id, p.name, p.email, p.role::text, o.name, r.last_active, r.decision, r.remove_after
    FROM inactive_account_reviews r
    JOIN profiles p ON p.id = r.user_id
    LEFT JOIN organizations o ON o.id = r.organization_id
   WHERE (r.decision IS NULL OR r.decision = 'remove')
     AND r.user_id <> auth.uid()
     AND public.can_handle_requests_for(r.organization_id)
   ORDER BY r.last_active;
$$;
REVOKE ALL ON FUNCTION public.list_inactive_account_reviews() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_inactive_account_reviews() TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_inactive_account(p_user uuid, p_decision text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org uuid;
BEGIN
  IF p_decision NOT IN ('keep', 'remove') THEN RAISE EXCEPTION 'decision must be keep or remove'; END IF;
  IF p_user = auth.uid() THEN RAISE EXCEPTION 'You cannot decide on your own account'; END IF;
  SELECT organization_id INTO org FROM inactive_account_reviews WHERE user_id = p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account is not up for review'; END IF;
  IF NOT public.can_handle_requests_for(org) THEN
    RAISE EXCEPTION 'Only a leader of this organization can decide this';
  END IF;
  UPDATE inactive_account_reviews
     SET decision = p_decision, decided_by = auth.uid(), decided_at = now(),
         remove_after = CASE WHEN p_decision = 'remove' THEN now() + interval '90 days' END
   WHERE user_id = p_user;
END;
$$;
REVOKE ALL ON FUNCTION public.decide_inactive_account(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_inactive_account(uuid, text) TO authenticated;

-- For the administrator's purge script: removals whose 90 days are up and who are still inactive.
CREATE OR REPLACE FUNCTION public.due_account_removals()
RETURNS TABLE(user_id uuid, email text, role text, remove_after timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.user_id, p.email, p.role::text, r.remove_after
    FROM inactive_account_reviews r JOIN profiles p ON p.id = r.user_id
   WHERE r.decision = 'remove' AND r.remove_after < now()
     AND public.account_last_active(r.user_id) <= r.flagged_at
     AND p.role::text <> 'platform_administrator';
$$;
REVOKE ALL ON FUNCTION public.due_account_removals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.due_account_removals() TO service_role;

-- Nightly flagging ('flag-inactive-accounts', 04:15 UTC) is scheduled separately in the database.
