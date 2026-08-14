-- Backfill: "public"."document_studio_projects" already exists live (created
-- out-of-band, outside migration history — Document Studio's save/load code
-- has referenced it since before this repo's migrations were baselined).
-- This migration documents its actual current shape so a fresh restore from
-- migration history reproduces it. All statements are IF NOT EXISTS / no-ops
-- against the live database.

CREATE TABLE IF NOT EXISTS "public"."document_studio_projects" (
    "id"            text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
    "user_id"       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    "name"          text NOT NULL DEFAULT 'Untitled',
    "project_data"  jsonb,
    "thumbnail_url" text,
    "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at"    timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "public"."document_studio_projects" OWNER TO "postgres";

ALTER TABLE "public"."document_studio_projects" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'document_studio_projects' AND p.polname = 'Users can manage own doc studio projects'
  ) THEN
    CREATE POLICY "Users can manage own doc studio projects" ON "public"."document_studio_projects"
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

GRANT ALL ON TABLE "public"."document_studio_projects" TO "anon";
GRANT ALL ON TABLE "public"."document_studio_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."document_studio_projects" TO "service_role";
