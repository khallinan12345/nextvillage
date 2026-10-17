-- Let an administrator merge a person's duplicate staff accounts (same email, neither an administrator),
-- as well as learner accounts. Everything else about merge_accounts() is unchanged.

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
  -- Learner accounts can be merged. Staff accounts only when both belong to the same person (same
  -- email) and neither is a platform administrator, so one person's duplicate leader accounts can be
  -- tidied up but two different staff members are never merged by mistake.
  IF NOT (
       (o.role::text IN ('student', 'learner') AND w.role::text IN ('student', 'learner'))
    OR (lower(coalesce(o.email, '')) <> '' AND lower(o.email) = lower(coalesce(w.email, ''))
        AND o.role::text <> 'platform_administrator' AND w.role::text <> 'platform_administrator')
  ) THEN
    RAISE EXCEPTION 'Only learner accounts, or duplicate staff accounts of one person, can be merged here';
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
