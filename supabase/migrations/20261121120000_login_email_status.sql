-- "Which email did I use?" (api/find-my-login.ts). Given an address a learner typed, says what the
-- sign-in system knows about it, so the platform can EMAIL that address the right message. The answer
-- is never shown on screen: only the owner of the mailbox ever learns it.
--   none      no sign-in uses this address
--   active    this address is a working sign-in
--   merged    the account was combined into another one; login_email is the address to use now
--   inactive  the account is switched off (ask a leader)
-- Looks at the sign-in address (auth.users), not profiles.email, because merged and Google accounts can
-- have a profile email that differs from the address the person actually signs in with.
-- Service role only: browsers and signed-in users cannot call it.

-- security-check: ignore db-definer-no-caller-check -- callable by the service role only (API route), grants below
CREATE OR REPLACE FUNCTION public.login_email_status(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  u_id uuid;
  cur uuid;
  nxt uuid;
  act boolean;
  hops int := 0;
  out_email text;
BEGIN
  SELECT id INTO u_id FROM auth.users WHERE lower(email) = lower(btrim(p_email)) LIMIT 1;
  IF u_id IS NULL THEN RETURN jsonb_build_object('status', 'none'); END IF;

  cur := u_id;
  LOOP
    SELECT p.merged_into, coalesce(p.is_active, true) INTO nxt, act FROM profiles p WHERE p.id = cur;
    EXIT WHEN nxt IS NULL OR hops >= 5;
    cur := nxt; hops := hops + 1;
  END LOOP;

  IF cur = u_id THEN
    RETURN jsonb_build_object('status', CASE WHEN coalesce(act, true) THEN 'active' ELSE 'inactive' END);
  END IF;
  SELECT email INTO out_email FROM auth.users WHERE id = cur;
  IF out_email IS NULL THEN RETURN jsonb_build_object('status', 'inactive'); END IF;
  RETURN jsonb_build_object('status', CASE WHEN coalesce(act, true) THEN 'merged' ELSE 'inactive' END, 'login_email', out_email);
END;
$$;
REVOKE ALL ON FUNCTION public.login_email_status(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_email_status(text) TO service_role;
