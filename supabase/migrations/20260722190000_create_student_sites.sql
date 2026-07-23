-- "Website Builder" — a text-only lead-in to the full Web Development page.
-- A student describes a multi-page website; the AI generates it behind the
-- scenes and the student publishes it to real, publicly shareable per-page
-- URLs (served by api/site-page/[siteId]/[slug].js, which bypasses RLS via
-- the service-role key — these tables stay authenticated/org-scoped for
-- management purposes only, same separation as api/chat-room.js).
--
-- No draft persistence — nothing is written here until the student clicks
-- Publish, matching student_games' simplicity.

CREATE TABLE IF NOT EXISTS "public"."student_sites" (
    "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "organization_id" uuid NOT NULL REFERENCES "public"."organizations"("id"),
    "owner_id"        uuid NOT NULL REFERENCES "public"."profiles"("id"),
    "owner_name"      text NOT NULL,
    "title"           text NOT NULL,
    "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"      timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "public"."student_sites" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."student_site_pages" (
    "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "site_id"      uuid NOT NULL REFERENCES "public"."student_sites"("id") ON DELETE CASCADE,
    "slug"         text NOT NULL,
    "title"        text NOT NULL,
    "html_content" text NOT NULL,
    "sort_order"   integer NOT NULL DEFAULT 0,
    "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "student_site_pages_site_slug_unique" UNIQUE ("site_id", "slug")
);

ALTER TABLE "public"."student_site_pages" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS "student_sites_org_created_idx"
  ON "public"."student_sites" ("organization_id", "created_at");

ALTER TABLE "public"."student_sites"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."student_site_pages"  ENABLE ROW LEVEL SECURITY;

-- student_sites: any org member (or platform admin) can see sites in their
-- own org — mirrors together_rooms_select / student_games_select.
CREATE POLICY "student_sites_select" ON "public"."student_sites"
  FOR SELECT TO "authenticated"
  USING (
    (SELECT "get_my_effective_profile"."role" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id")) = 'platform_administrator'
    OR "organization_id" = (SELECT "get_my_effective_profile"."organization_id" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id"))
  );

-- A student can only publish as themselves, into their own org.
CREATE POLICY "student_sites_insert" ON "public"."student_sites"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "owner_id" = auth.uid()
    AND "organization_id" IS NOT NULL
    AND "organization_id" = (SELECT "get_my_effective_profile"."organization_id" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id"))
  );

-- Owner can delete a site they published; leaders (or platform admin) can
-- delete any site in their org — mirrors student_games_delete.
CREATE POLICY "student_sites_delete" ON "public"."student_sites"
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

-- student_site_pages: readable by the same org members who can see the
-- parent site — mirrors together_messages_select's join-to-parent shape.
CREATE POLICY "student_site_pages_select" ON "public"."student_site_pages"
  FOR SELECT TO "authenticated"
  USING (
    (SELECT "get_my_effective_profile"."role" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id")) = 'platform_administrator'
    OR EXISTS (
      SELECT 1 FROM "public"."student_sites" s
      WHERE s.id = student_site_pages.site_id
        AND s.organization_id = (SELECT "get_my_effective_profile"."organization_id" FROM "public"."get_my_effective_profile"() "get_my_effective_profile"("role","organization_id"))
    )
  );

-- Only the site's own owner can insert its pages — happens once, at
-- publish time, alongside the student_sites insert.
CREATE POLICY "student_site_pages_insert" ON "public"."student_site_pages"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "public"."student_sites" s
      WHERE s.id = student_site_pages.site_id
        AND s.owner_id = auth.uid()
    )
  );

GRANT ALL ON TABLE "public"."student_sites"      TO "anon";
GRANT ALL ON TABLE "public"."student_sites"      TO "authenticated";
GRANT ALL ON TABLE "public"."student_sites"      TO "service_role";

GRANT ALL ON TABLE "public"."student_site_pages" TO "anon";
GRANT ALL ON TABLE "public"."student_site_pages" TO "authenticated";
GRANT ALL ON TABLE "public"."student_site_pages" TO "service_role";
