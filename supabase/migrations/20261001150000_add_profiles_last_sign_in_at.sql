-- Track last login time on profiles, synced from auth.users whenever
-- Supabase Auth updates last_sign_in_at (i.e. on every successful login).

ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "last_sign_in_at" timestamp with time zone;

CREATE OR REPLACE FUNCTION "public"."sync_profile_last_sign_in"()
RETURNS "trigger"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET last_sign_in_at = NEW.last_sign_in_at
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "on_auth_user_sign_in" ON "auth"."users";

CREATE TRIGGER "on_auth_user_sign_in"
  AFTER UPDATE OF "last_sign_in_at" ON "auth"."users"
  FOR EACH ROW
  WHEN (NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at)
  EXECUTE FUNCTION "public"."sync_profile_last_sign_in"();

REVOKE ALL ON FUNCTION "public"."sync_profile_last_sign_in"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."sync_profile_last_sign_in"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."sync_profile_last_sign_in"() FROM "authenticated";
