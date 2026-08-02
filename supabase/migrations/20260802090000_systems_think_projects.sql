-- "Systems Think" — Projects.
--
-- Lets a user group related sessions together (e.g. "the biogas idea",
-- "community solar plan"). A session's project_id is nullable — sessions
-- start unfiled, and deleting a project unfiles its sessions rather than
-- destroying them (ON DELETE SET NULL), since a project is an organizational
-- grouping, not the owner of the underlying thinking work.

CREATE TABLE IF NOT EXISTS "public"."systems_think_projects" (
    "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id"    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    "name"       text NOT NULL DEFAULT 'New Project',
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "public"."systems_think_projects" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS "systems_think_projects_user_updated_idx"
  ON "public"."systems_think_projects" ("user_id", "updated_at" DESC);

ALTER TABLE "public"."systems_think_projects" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own systems think projects" ON "public"."systems_think_projects"
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own systems think projects" ON "public"."systems_think_projects"
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own systems think projects" ON "public"."systems_think_projects"
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own systems think projects" ON "public"."systems_think_projects"
  FOR DELETE USING (auth.uid() = user_id);

GRANT ALL ON TABLE "public"."systems_think_projects" TO "anon";
GRANT ALL ON TABLE "public"."systems_think_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."systems_think_projects" TO "service_role";

ALTER TABLE "public"."systems_think_sessions"
  ADD COLUMN IF NOT EXISTS "project_id" uuid REFERENCES "public"."systems_think_projects"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "systems_think_sessions_project_idx"
  ON "public"."systems_think_sessions" ("project_id");
