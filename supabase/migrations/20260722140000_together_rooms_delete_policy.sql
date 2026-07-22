-- "Use Claude Together" — allow deleting a room (hard delete, not the
-- soft-close pattern used by together_rooms_update): a member can delete a
-- room they created; leaders (or platform admin) can delete any room in
-- their own org. A room a leader created is therefore only ever deletable
-- by a leader — its creator, or another leader — never by a regular member
-- who didn't start it.
--
-- together_messages rows cascade-delete via their room_id FK
-- (ON DELETE CASCADE, see 20260721163420_create_together_chat_tables.sql)
-- and that cascade bypasses together_messages' own RLS, so no separate
-- policy is needed there.
CREATE POLICY "together_rooms_delete" ON "public"."together_rooms"
  FOR DELETE TO "authenticated"
  USING (
    (SELECT "get_my_effective_profile"."role" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id")) = 'platform_administrator'
    OR (
      "organization_id" = (SELECT "get_my_effective_profile"."organization_id" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id"))
      AND (
        "created_by" = auth.uid()
        OR (SELECT "get_my_effective_profile"."role" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id")) = ANY (ARRAY['teacher','site_leader','facilitator','leader','research_lead'])
      )
    )
  );
