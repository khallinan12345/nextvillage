-- Administrators can find and merge duplicate accounts. The newest account stays active; everything
-- the older account did is moved onto it. Where both accounts already have the same record (a unique
-- rule would be broken), the newer account's copy is kept and the older copy is dropped. The older
-- profile is retired (is_active = false, merged_into = newest). Nothing is merged automatically: an
-- administrator previews and confirms each pair. Replaces the manual steps in
-- docs/runbooks/duplicate-user.md.

CREATE TABLE IF NOT EXISTS public.account_merge_log (
  id         bigserial PRIMARY KEY,
  old_id     uuid NOT NULL,
  new_id     uuid NOT NULL,
  merged_by  uuid,
  merged_at  timestamptz NOT NULL DEFAULT now(),
  moved      jsonb
);
ALTER TABLE public.account_merge_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_merge_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.account_merge_log_id_seq FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.find_duplicate_accounts()
RETURNS TABLE(old_id uuid, old_name text, old_email text, old_created timestamptz, old_last_seen timestamptz,
              new_id uuid, new_name text, new_email text, new_created timestamptz, new_last_seen timestamptz,
              reason text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles me WHERE me.id = auth.uid() AND me.role::text = 'platform_administrator') THEN
    RAISE EXCEPTION 'Administrators only';
  END IF;
  RETURN QUERY
  WITH k AS (
    SELECT p.id, p.name, p.email, p.created_at, p.last_sign_in_at,
           NULLIF(regexp_replace(lower(coalesce(p.name, '')), '[^a-z]', '', 'g'), '') AS nkey,
           NULLIF(regexp_replace(split_part(lower(coalesce(p.email, '')), '@', 1), '[^a-z]', '', 'g'), '') AS ekey
      FROM profiles p
     WHERE p.role::text IN ('student', 'learner')
       AND coalesce(p.is_active, true) AND p.merged_into IS NULL
  ), pairs AS (
    SELECT DISTINCT ON (a.id) a.id AS aid, b.id AS bid,
           CASE WHEN a.nkey = b.nkey THEN 'same name' ELSE 'similar email' END AS why
      FROM k a JOIN k b ON b.id <> a.id AND b.created_at > a.created_at
       AND ((length(a.nkey) >= 5 AND a.nkey = b.nkey) OR (length(a.ekey) >= 6 AND a.ekey = b.ekey))
     ORDER BY a.id, b.created_at DESC
  )
  SELECT a.id, a.name, a.email, a.created_at, a.last_sign_in_at,
         b.id, b.name, b.email, b.created_at, b.last_sign_in_at, pr.why
    FROM pairs pr JOIN k a ON a.id = pr.aid JOIN k b ON b.id = pr.bid
   ORDER BY b.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.find_duplicate_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_duplicate_accounts() TO authenticated;

CREATE OR REPLACE FUNCTION public.merge_accounts(p_old uuid, p_new uuid, p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  t record;
  r record;
  result jsonb := '{}'::jsonb;
  n bigint;
  tot bigint;
  o profiles%ROWTYPE;
  w profiles%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles me WHERE me.id = auth.uid() AND me.role::text = 'platform_administrator') THEN
    RAISE EXCEPTION 'Administrators only';
  END IF;
  IF p_old = p_new THEN RAISE EXCEPTION 'Choose two different accounts'; END IF;
  SELECT * INTO o FROM profiles WHERE id = p_old;
  SELECT * INTO w FROM profiles WHERE id = p_new;
  IF o.id IS NULL OR w.id IS NULL THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF o.role::text NOT IN ('student', 'learner') OR w.role::text NOT IN ('student', 'learner') THEN
    RAISE EXCEPTION 'Only learner accounts can be merged here';
  END IF;
  IF o.merged_into IS NOT NULL OR NOT coalesce(w.is_active, true) OR w.merged_into IS NOT NULL THEN
    RAISE EXCEPTION 'One of these accounts is already merged or retired';
  END IF;

  FOR t IN
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
     WHERE c.table_schema = 'public' AND tb.table_type = 'BASE TABLE'
       AND c.column_name IN ('user_id', 'learner_id', 'owner_id', 'sender_id', 'created_by',
                             'youth_user_id', 'champion_user_id', 'referred_learner_id')
       AND c.data_type IN ('uuid', 'text', 'character varying')
       AND c.table_name NOT IN ('profiles', 'dashboard_placeholder_archive', 'account_merge_log',
                                'data_requests', 'inactive_account_reviews')
     ORDER BY c.table_name, c.column_name
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I::text = $1', t.table_name, t.column_name)
      INTO n USING p_old::text;
    IF n = 0 THEN CONTINUE; END IF;
    result := result || jsonb_build_object(t.table_name || '.' || t.column_name, n);
    IF p_dry_run THEN CONTINUE; END IF;
    BEGIN
      EXECUTE format('UPDATE public.%I SET %I = %L WHERE %I::text = $1',
                     t.table_name, t.column_name, p_new::text, t.column_name) USING p_old::text;
    EXCEPTION WHEN unique_violation THEN
      -- some rows would duplicate ones the newer account already has: move the rest one at a time,
      -- and drop only the older copies that collide
      FOR r IN EXECUTE format('SELECT ctid AS c FROM public.%I WHERE %I::text = $1', t.table_name, t.column_name)
               USING p_old::text
      LOOP
        BEGIN
          EXECUTE format('UPDATE public.%I SET %I = %L WHERE ctid = $1', t.table_name, t.column_name, p_new::text)
            USING r.c;
        EXCEPTION WHEN unique_violation THEN
          EXECUTE format('DELETE FROM public.%I WHERE ctid = $1', t.table_name) USING r.c;
        END;
      END LOOP;
    END;
  END LOOP;

  IF NOT p_dry_run THEN
    UPDATE profiles SET
      organization_id = coalesce(w.organization_id, o.organization_id),
      membership_status = CASE WHEN w.organization_id IS NULL AND o.organization_id IS NOT NULL
                               THEN o.membership_status ELSE w.membership_status END,
      join_code_used = coalesce(w.join_code_used, o.join_code_used),
      birth_year = coalesce(w.birth_year, o.birth_year),
      country = coalesce(w.country, o.country),
      school_name = coalesce(w.school_name, o.school_name),
      city = coalesce(w.city, o.city),
      state = coalesce(w.state, o.state),
      gender = coalesce(w.gender, o.gender),
      grade_level = coalesce(w.grade_level, o.grade_level),
      avatar_url = coalesce(w.avatar_url, o.avatar_url)
    WHERE id = p_new;
    UPDATE profiles SET is_active = false, merged_into = p_new WHERE id = p_old;
    INSERT INTO account_merge_log (old_id, new_id, merged_by, moved) VALUES (p_old, p_new, auth.uid(), result);
  END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.merge_accounts(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_accounts(uuid, uuid, boolean) TO authenticated;
