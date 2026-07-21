-- "Use Claude Together" — generalize from Back to Basics Youth Education
-- only to every organization, each scoped to its own users (rooms in one
-- org are invisible to another org's members).

-- ── New helper: resolve the caller's *effective* organization ──────────────
-- organization_id isn't always populated for join-code signups, so this
-- resolves organization_id first, falling back to looking up the org whose
-- join_code/join_codes matches the profile's join_code_used. Supersedes
-- get_my_profile_ext() (introduced for the single-org version of this
-- feature), which is dropped below since nothing else depends on it.
CREATE OR REPLACE FUNCTION "public"."get_my_effective_profile"()
RETURNS TABLE("role" "text", "organization_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    p.role::text,
    COALESCE(
      p.organization_id,
      (SELECT o.id FROM organizations o
       WHERE o.join_code = p.join_code_used
          OR p.join_code_used = ANY(o.join_codes)
       LIMIT 1)
    ) AS organization_id
  FROM profiles p
  WHERE p.id = auth.uid();
$$;

ALTER FUNCTION "public"."get_my_effective_profile"() OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."get_my_effective_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_effective_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_effective_profile"() TO "service_role";

-- ── Drop the single-org guardrail and switch to a real FK ──────────────────
-- Any organization can now own rooms — referential integrity (must be a
-- real org) replaces the old "must be Back to Basics" CHECK constraint.
ALTER TABLE "public"."together_rooms" DROP CONSTRAINT IF EXISTS "together_rooms_org_scope_check";
ALTER TABLE "public"."together_rooms"
  ADD CONSTRAINT "together_rooms_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");

-- ── Drop old single-org policies ─────────────────────────────────────────
DROP POLICY IF EXISTS "together_rooms_select" ON "public"."together_rooms";
DROP POLICY IF EXISTS "together_rooms_insert" ON "public"."together_rooms";
DROP POLICY IF EXISTS "together_rooms_update" ON "public"."together_rooms";
DROP POLICY IF EXISTS "together_messages_select" ON "public"."together_messages";
DROP POLICY IF EXISTS "together_messages_insert_user" ON "public"."together_messages";
DROP POLICY IF EXISTS "together_messages_update_moderate" ON "public"."together_messages";

-- ── New per-org policies (any org, scoped to the caller's own org) ────────

-- together_rooms: any org member can see/create rooms in their own org.
CREATE POLICY "together_rooms_select" ON "public"."together_rooms"
  FOR SELECT TO "authenticated"
  USING (
    (SELECT "get_my_effective_profile"."role" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id")) = 'platform_administrator'
    OR "organization_id" = (SELECT "get_my_effective_profile"."organization_id" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id"))
  );

CREATE POLICY "together_rooms_insert" ON "public"."together_rooms"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "created_by" = auth.uid()
    AND "organization_id" IS NOT NULL
    AND "organization_id" = (SELECT "get_my_effective_profile"."organization_id" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id"))
  );

-- Only leader-role members (or platform admin) in the SAME org as the room
-- can close/archive it.
CREATE POLICY "together_rooms_update" ON "public"."together_rooms"
  FOR UPDATE TO "authenticated"
  USING (
    (SELECT "get_my_effective_profile"."role" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id")) = 'platform_administrator'
    OR (
      (SELECT "get_my_effective_profile"."role" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id")) = ANY (ARRAY['teacher','site_leader','facilitator','leader','research_lead'])
      AND "organization_id" = (SELECT "get_my_effective_profile"."organization_id" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id"))
    )
  )
  WITH CHECK (
    (SELECT "get_my_effective_profile"."role" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id")) = 'platform_administrator'
    OR (
      (SELECT "get_my_effective_profile"."role" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id")) = ANY (ARRAY['teacher','site_leader','facilitator','leader','research_lead'])
      AND "organization_id" = (SELECT "get_my_effective_profile"."organization_id" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id"))
    )
  );

-- together_messages: any org member can read messages in a room belonging
-- to their own org (including soft-deleted rows — rendered as a
-- placeholder by the frontend, not filtered out here).
CREATE POLICY "together_messages_select" ON "public"."together_messages"
  FOR SELECT TO "authenticated"
  USING (
    (SELECT "get_my_effective_profile"."role" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id")) = 'platform_administrator'
    OR EXISTS (
      SELECT 1 FROM "public"."together_rooms" r
      WHERE r.id = together_messages.room_id
        AND r.organization_id = (SELECT "get_my_effective_profile"."organization_id" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id"))
    )
  );

-- Only user-authored inserts by a member of the room's own org, into an
-- active room. Assistant rows are written exclusively by api/chat-room.js
-- via the service_role key (bypasses RLS).
CREATE POLICY "together_messages_insert_user" ON "public"."together_messages"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "role" = 'user'
    AND "sender_id" = auth.uid()
    AND EXISTS (
      SELECT 1 FROM "public"."together_rooms" r
      WHERE r.id = together_messages.room_id
        AND r.status = 'active'
        AND r.organization_id = (SELECT "get_my_effective_profile"."organization_id" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id"))
    )
  );

-- Only leader-role members (or platform admin) in the room's own org can
-- soft-delete a message.
CREATE POLICY "together_messages_update_moderate" ON "public"."together_messages"
  FOR UPDATE TO "authenticated"
  USING (
    (SELECT "get_my_effective_profile"."role" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id")) = 'platform_administrator'
    OR (
      (SELECT "get_my_effective_profile"."role" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id")) = ANY (ARRAY['teacher','site_leader','facilitator','leader','research_lead'])
      AND EXISTS (
        SELECT 1 FROM "public"."together_rooms" r
        WHERE r.id = together_messages.room_id
          AND r.organization_id = (SELECT "get_my_effective_profile"."organization_id" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id"))
      )
    )
  )
  WITH CHECK (
    (SELECT "get_my_effective_profile"."role" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id")) = 'platform_administrator'
    OR (
      (SELECT "get_my_effective_profile"."role" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id")) = ANY (ARRAY['teacher','site_leader','facilitator','leader','research_lead'])
      AND EXISTS (
        SELECT 1 FROM "public"."together_rooms" r
        WHERE r.id = together_messages.room_id
          AND r.organization_id = (SELECT "get_my_effective_profile"."organization_id" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id"))
      )
    )
  );

-- get_my_profile_ext() is fully superseded by get_my_effective_profile()
-- and nothing else references it.
DROP FUNCTION IF EXISTS "public"."get_my_profile_ext"();
