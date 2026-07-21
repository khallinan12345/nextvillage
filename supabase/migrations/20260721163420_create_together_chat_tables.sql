-- "Use Claude Together" — multi-user collaborative chat rooms.
-- Restricted to Back to Basics Youth Education (org id below) for now,
-- following the same single-org-scoped-feature pattern already used for
-- Davidson AI Futures Lab's community-challenge tables (see
-- 20260720012719_scope_community_challenge_tables_to_org.sql).

-- ── New helper: get_my_profile() + join_code_used ──────────────────────────
-- get_my_profile() returns (role, organization_id) and several existing
-- policies destructure it with that exact 2-column shape — added as a new
-- function instead of altering it, so nothing else is disturbed. Needed
-- because some Back to Basics accounts only have join_code_used populated,
-- not organization_id (the same reason the frontend checks both).
CREATE OR REPLACE FUNCTION "public"."get_my_profile_ext"()
RETURNS TABLE("role" "text", "organization_id" "uuid", "join_code_used" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role::text, organization_id, join_code_used
  FROM profiles
  WHERE id = auth.uid();
$$;

ALTER FUNCTION "public"."get_my_profile_ext"() OWNER TO "postgres";

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "public"."together_rooms" (
    "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "organization_id" uuid NOT NULL,
    "name"            text NOT NULL,
    "created_by"      uuid NOT NULL REFERENCES "public"."profiles"("id"),
    "created_by_name" text NOT NULL,
    "status"          text NOT NULL DEFAULT 'active',
    "model"           text NOT NULL DEFAULT 'claude-sonnet-5',
    "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
    "closed_at"       timestamp with time zone,
    "closed_by"       uuid REFERENCES "public"."profiles"("id"),
    CONSTRAINT "together_rooms_status_check" CHECK ("status" IN ('active','closed')),
    -- DB-level guardrail: structurally impossible to create a room for any
    -- org but Back to Basics, independent of RLS.
    CONSTRAINT "together_rooms_org_scope_check"
      CHECK ("organization_id" = 'bf573bfa-c57a-4476-be26-508991bb4d76'::uuid)
);

ALTER TABLE "public"."together_rooms" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."together_messages" (
    "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "room_id"     uuid NOT NULL REFERENCES "public"."together_rooms"("id") ON DELETE CASCADE,
    "sender_id"   uuid REFERENCES "public"."profiles"("id"),
    "sender_name" text NOT NULL,
    "role"        text NOT NULL,
    "content"     text NOT NULL,
    "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
    "deleted_at"  timestamp with time zone,
    "deleted_by"  uuid REFERENCES "public"."profiles"("id"),
    CONSTRAINT "together_messages_role_check" CHECK ("role" IN ('user','assistant')),
    CONSTRAINT "together_messages_sender_check" CHECK (
      ("role" = 'user' AND "sender_id" IS NOT NULL) OR
      ("role" = 'assistant' AND "sender_id" IS NULL)
    )
);

ALTER TABLE "public"."together_messages" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS "together_messages_room_created_idx"
  ON "public"."together_messages" ("room_id", "created_at");
CREATE INDEX IF NOT EXISTS "together_rooms_org_status_idx"
  ON "public"."together_rooms" ("organization_id", "status");

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE "public"."together_rooms"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."together_messages" ENABLE ROW LEVEL SECURITY;

-- together_rooms: any org member (by org id or join code) can see rooms.
CREATE POLICY "together_rooms_select" ON "public"."together_rooms"
  FOR SELECT TO "authenticated"
  USING (
    (SELECT "get_my_profile_ext"."role" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = 'platform_administrator'
    OR (SELECT "get_my_profile_ext"."organization_id" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = 'bf573bfa-c57a-4476-be26-508991bb4d76'::uuid
    OR (SELECT "get_my_profile_ext"."join_code_used" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = 'Y3K9DC'
  );

-- Any org member can create a room.
CREATE POLICY "together_rooms_insert" ON "public"."together_rooms"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "organization_id" = 'bf573bfa-c57a-4476-be26-508991bb4d76'::uuid
    AND "created_by" = auth.uid()
    AND (
      (SELECT "get_my_profile_ext"."organization_id" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = 'bf573bfa-c57a-4476-be26-508991bb4d76'::uuid
      OR (SELECT "get_my_profile_ext"."join_code_used" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = 'Y3K9DC'
    )
  );

-- Only leader-role members (or platform admin) can close/archive a room —
-- not even the student who created it. Leader-role set copied verbatim from
-- the existing dashboard_select policy's list.
CREATE POLICY "together_rooms_update" ON "public"."together_rooms"
  FOR UPDATE TO "authenticated"
  USING (
    (SELECT "get_my_profile_ext"."role" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = 'platform_administrator'
    OR (
      (SELECT "get_my_profile_ext"."role" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = ANY (ARRAY['teacher','site_leader','facilitator','leader','research_lead'])
      AND (
        (SELECT "get_my_profile_ext"."organization_id" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = 'bf573bfa-c57a-4476-be26-508991bb4d76'::uuid
        OR (SELECT "get_my_profile_ext"."join_code_used" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = 'Y3K9DC'
      )
    )
  )
  WITH CHECK (
    (SELECT "get_my_profile_ext"."role" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = 'platform_administrator'
    OR (
      (SELECT "get_my_profile_ext"."role" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = ANY (ARRAY['teacher','site_leader','facilitator','leader','research_lead'])
      AND (
        (SELECT "get_my_profile_ext"."organization_id" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = 'bf573bfa-c57a-4476-be26-508991bb4d76'::uuid
        OR (SELECT "get_my_profile_ext"."join_code_used" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = 'Y3K9DC'
      )
    )
  );

-- together_messages: any org member can read (including soft-deleted rows —
-- the frontend renders those as a "[message removed]" placeholder rather
-- than hiding them, so conversation flow stays intact for everyone).
CREATE POLICY "together_messages_select" ON "public"."together_messages"
  FOR SELECT TO "authenticated"
  USING (
    (SELECT "get_my_profile_ext"."role" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = 'platform_administrator'
    OR (SELECT "get_my_profile_ext"."organization_id" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = 'bf573bfa-c57a-4476-be26-508991bb4d76'::uuid
    OR (SELECT "get_my_profile_ext"."join_code_used" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = 'Y3K9DC'
  );

-- Only user-authored inserts are allowed via RLS — deliberately no policy
-- permits role = 'assistant' inserts by authenticated, so a user can never
-- spoof Claude's identity via a direct REST call. Assistant rows are written
-- exclusively by api/chat-room.js using the service_role key (bypasses RLS).
CREATE POLICY "together_messages_insert_user" ON "public"."together_messages"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "role" = 'user'
    AND "sender_id" = auth.uid()
    AND (
      (SELECT "get_my_profile_ext"."organization_id" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = 'bf573bfa-c57a-4476-be26-508991bb4d76'::uuid
      OR (SELECT "get_my_profile_ext"."join_code_used" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = 'Y3K9DC'
    )
    AND EXISTS (
      SELECT 1 FROM "public"."together_rooms" r WHERE r.id = together_messages.room_id AND r.status = 'active'
    )
  );

-- Only leader-role members (or platform admin) can soft-delete a message.
CREATE POLICY "together_messages_update_moderate" ON "public"."together_messages"
  FOR UPDATE TO "authenticated"
  USING (
    (SELECT "get_my_profile_ext"."role" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = 'platform_administrator'
    OR (
      (SELECT "get_my_profile_ext"."role" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = ANY (ARRAY['teacher','site_leader','facilitator','leader','research_lead'])
      AND (
        (SELECT "get_my_profile_ext"."organization_id" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = 'bf573bfa-c57a-4476-be26-508991bb4d76'::uuid
        OR (SELECT "get_my_profile_ext"."join_code_used" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = 'Y3K9DC'
      )
    )
  )
  WITH CHECK (
    (SELECT "get_my_profile_ext"."role" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = 'platform_administrator'
    OR (
      (SELECT "get_my_profile_ext"."role" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = ANY (ARRAY['teacher','site_leader','facilitator','leader','research_lead'])
      AND (
        (SELECT "get_my_profile_ext"."organization_id" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = 'bf573bfa-c57a-4476-be26-508991bb4d76'::uuid
        OR (SELECT "get_my_profile_ext"."join_code_used" FROM "public"."get_my_profile_ext"() "get_my_profile_ext"("role","organization_id","join_code_used")) = 'Y3K9DC'
      )
    )
  );

-- service_role bypasses RLS entirely (used by api/chat-room.js to insert
-- assistant replies and to re-derive authorization); no explicit policy
-- needed for it, matching the existing service_manages_* policies elsewhere
-- in the schema.

-- ── Realtime ──────────────────────────────────────────────────────────────
-- First tables ever added to this publication in this app.
ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."together_rooms";
ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."together_messages";

GRANT ALL ON TABLE "public"."together_rooms" TO "anon";
GRANT ALL ON TABLE "public"."together_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."together_rooms" TO "service_role";

GRANT ALL ON TABLE "public"."together_messages" TO "anon";
GRANT ALL ON TABLE "public"."together_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."together_messages" TO "service_role";

GRANT ALL ON FUNCTION "public"."get_my_profile_ext"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_profile_ext"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_profile_ext"() TO "service_role";
