-- Fixes "infinite recursion detected in policy for relation together_rooms"
-- from together_rooms_rename_own (20260723010000): its WITH CHECK compared
-- the new row's status to a plain subquery against together_rooms itself,
-- which Postgres's RLS recursion detector rejects outright — evaluating
-- that subquery's SELECT re-triggers policy evaluation on the very table
-- whose UPDATE policy is already being evaluated.
--
-- Fixed the same way get_my_effective_profile() avoids this class of
-- problem elsewhere in this schema: a SECURITY DEFINER function runs as
-- its owner, so its internal query against together_rooms is not subject
-- to the calling role's RLS at all, breaking the recursion.
CREATE OR REPLACE FUNCTION "public"."get_together_room_status"("room_id" uuid)
RETURNS text
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT status FROM together_rooms WHERE id = room_id;
$$;

ALTER FUNCTION "public"."get_together_room_status"(uuid) OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."get_together_room_status"(uuid) TO "anon";
GRANT ALL ON FUNCTION "public"."get_together_room_status"(uuid) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_together_room_status"(uuid) TO "service_role";

DROP POLICY IF EXISTS "together_rooms_rename_own" ON "public"."together_rooms";

CREATE POLICY "together_rooms_rename_own" ON "public"."together_rooms"
  FOR UPDATE TO "authenticated"
  USING (
    "created_by" = auth.uid()
    AND "organization_id" = (SELECT "get_my_effective_profile"."organization_id" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id"))
  )
  WITH CHECK (
    "created_by" = auth.uid()
    AND "status" = "public"."get_together_room_status"("together_rooms"."id")
  );
