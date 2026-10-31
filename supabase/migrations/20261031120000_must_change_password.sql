-- Temporary passwords: an account created by an administrator with a password they chose carries
-- app_metadata.must_change_password = true (set with the SQL in docs, never by the user: app_metadata cannot be
-- edited from the browser). The app refuses to show anything else until the person sets their own password,
-- then calls this function to clear the flag. It only ever touches the caller's own row.

CREATE OR REPLACE FUNCTION public.clear_must_change_password()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;

  UPDATE auth.users
     SET raw_app_meta_data = raw_app_meta_data - 'must_change_password'
   WHERE id = auth.uid();
END;
$$;

-- Supabase auto-grants new functions to anon/authenticated; revoke explicitly, then allow signed-in users only.
REVOKE ALL ON FUNCTION public.clear_must_change_password() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_must_change_password() TO authenticated;
