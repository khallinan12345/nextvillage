-- "Use Claude Together" — fix 403 on sending a message into a room outside
-- the poster's own org.
--
-- together_messages_insert_user (see 20260721225744_generalize_together_
-- rooms_to_all_orgs.sql) requires the room's organization_id to exactly
-- match the poster's own effective org, with no platform_administrator
-- bypass — unlike every other policy on these two tables (room select/
-- update, message select/update), which all treat platform_administrator
-- as able to act across every org. Rooms created back when this feature was
-- single-org-only (CHECK org = Back to Basics, see
-- 20260721163420_create_together_chat_tables.sql) are still owned by that
-- org even though they were created by an admin whose own profile is in a
-- different org today — so that admin can see and moderate the room (the
-- SELECT/UPDATE bypass lets them) but can't post into it. Bring INSERT in
-- line with the rest.
DROP POLICY IF EXISTS "together_messages_insert_user" ON "public"."together_messages";

CREATE POLICY "together_messages_insert_user" ON "public"."together_messages"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "role" = 'user'
    AND "sender_id" = auth.uid()
    AND EXISTS (
      SELECT 1 FROM "public"."together_rooms" r
      WHERE r.id = together_messages.room_id
        AND r.status = 'active'
        AND (
          r.organization_id = (SELECT "get_my_effective_profile"."organization_id" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id"))
          OR (SELECT "get_my_effective_profile"."role" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id")) = 'platform_administrator'
        )
    )
  );
