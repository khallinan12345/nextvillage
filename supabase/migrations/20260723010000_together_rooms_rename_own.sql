-- "Use Claude Together" — let a room's own creator rename it (matching the
-- existing delete permission: creator or leader). The existing
-- together_rooms_update policy only grants UPDATE to leader-role members
-- (or platform admin) — that was deliberately leader-only for closing a
-- room ("not even the student who created it", per the original design).
-- Broadening that policy directly would accidentally also let a creator
-- close their own room as a side effect, which isn't being asked for here.
--
-- Instead, this is a second PERMISSIVE UPDATE policy (Postgres ORs
-- multiple permissive policies for the same command together), scoped to
-- the creator, that only succeeds if `status` is unchanged from its
-- current stored value — so a creator can rename their room, but cannot
-- use this policy to close/reopen it. A non-leader creator trying to
-- sneak a status change through would fail this policy's WITH CHECK and
-- doesn't qualify under the leader-only policy either, so the whole
-- UPDATE is correctly rejected.
CREATE POLICY "together_rooms_rename_own" ON "public"."together_rooms"
  FOR UPDATE TO "authenticated"
  USING (
    "created_by" = auth.uid()
    AND "organization_id" = (SELECT "get_my_effective_profile"."organization_id" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id"))
  )
  WITH CHECK (
    "created_by" = auth.uid()
    AND "status" = (SELECT r.status FROM "public"."together_rooms" r WHERE r.id = together_rooms.id)
  );
