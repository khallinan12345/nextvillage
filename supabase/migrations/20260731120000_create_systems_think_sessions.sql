-- "Systems Think" (Virtual Kevin) — a single-user reflective thinking-partner
-- tool under the Claude nav section, alongside Use Claude / Use Claude
-- Together. Mirrors ai_playground_chats' shape (per-user session list with a
-- jsonb message array) since this is the same kind of general single-thread
-- chat tool, not a stage/rubric-based learning activity.

CREATE TABLE IF NOT EXISTS "public"."systems_think_sessions" (
    "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id"    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    "title"      text NOT NULL DEFAULT 'New Session',
    "messages"   jsonb NOT NULL DEFAULT '[]'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "public"."systems_think_sessions" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS "systems_think_sessions_user_updated_idx"
  ON "public"."systems_think_sessions" ("user_id", "updated_at" DESC);

ALTER TABLE "public"."systems_think_sessions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own systems think sessions" ON "public"."systems_think_sessions"
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own systems think sessions" ON "public"."systems_think_sessions"
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own systems think sessions" ON "public"."systems_think_sessions"
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own systems think sessions" ON "public"."systems_think_sessions"
  FOR DELETE USING (auth.uid() = user_id);

GRANT ALL ON TABLE "public"."systems_think_sessions" TO "anon";
GRANT ALL ON TABLE "public"."systems_think_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."systems_think_sessions" TO "service_role";
