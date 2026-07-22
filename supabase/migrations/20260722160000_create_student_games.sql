-- "Create Game" — students describe a game idea, AI generates a
-- self-contained HTML/canvas game, and the student can publish it to a
-- shareable in-app URL (/tech-skills/games/:id). No draft persistence —
-- nothing is written here until the student clicks Publish, so this table
-- only ever holds finished, published games.

CREATE TABLE IF NOT EXISTS "public"."student_games" (
    "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "organization_id" uuid NOT NULL REFERENCES "public"."organizations"("id"),
    "owner_id"        uuid NOT NULL REFERENCES "public"."profiles"("id"),
    "owner_name"      text NOT NULL,
    "title"           text NOT NULL,
    "html_content"    text NOT NULL,
    "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"      timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "public"."student_games" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS "student_games_org_created_idx"
  ON "public"."student_games" ("organization_id", "created_at");

ALTER TABLE "public"."student_games" ENABLE ROW LEVEL SECURITY;

-- Any org member (or platform admin) can see published games in their own
-- org — mirrors together_rooms_select.
CREATE POLICY "student_games_select" ON "public"."student_games"
  FOR SELECT TO "authenticated"
  USING (
    (SELECT "get_my_effective_profile"."role" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id")) = 'platform_administrator'
    OR "organization_id" = (SELECT "get_my_effective_profile"."organization_id" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id"))
  );

-- A student can only publish as themselves, into their own org.
CREATE POLICY "student_games_insert" ON "public"."student_games"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "owner_id" = auth.uid()
    AND "organization_id" IS NOT NULL
    AND "organization_id" = (SELECT "get_my_effective_profile"."organization_id" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id"))
  );

-- Owner can delete a game they published; leaders (or platform admin) can
-- delete any game in their org — mirrors together_rooms_delete.
CREATE POLICY "student_games_delete" ON "public"."student_games"
  FOR DELETE TO "authenticated"
  USING (
    (SELECT "get_my_effective_profile"."role" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id")) = 'platform_administrator'
    OR (
      "organization_id" = (SELECT "get_my_effective_profile"."organization_id" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id"))
      AND (
        "owner_id" = auth.uid()
        OR (SELECT "get_my_effective_profile"."role" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id")) = ANY (ARRAY['teacher','site_leader','facilitator','leader','research_lead'])
      )
    )
  );

GRANT ALL ON TABLE "public"."student_games" TO "anon";
GRANT ALL ON TABLE "public"."student_games" TO "authenticated";
GRANT ALL ON TABLE "public"."student_games" TO "service_role";
