-- Model config table: lets chat.js and model-check.js swap a provider's
-- model ID with a row update instead of a redeploy. RLS is enabled with no
-- policies, so only the service-role key (already used by chat.js and the
-- cron jobs) can read or write it.

CREATE TABLE IF NOT EXISTS "public"."model_config" (
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."model_config" OWNER TO "postgres";

ALTER TABLE ONLY "public"."model_config"
    ADD CONSTRAINT "model_config_pkey" PRIMARY KEY ("provider");

CREATE OR REPLACE FUNCTION "public"."touch_model_config"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end $$;

ALTER FUNCTION "public"."touch_model_config"() OWNER TO "postgres";

CREATE OR REPLACE TRIGGER "model_config_touch" BEFORE UPDATE ON "public"."model_config" FOR EACH ROW EXECUTE FUNCTION "public"."touch_model_config"();

ALTER TABLE "public"."model_config" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE "public"."model_config" TO "anon";
GRANT ALL ON TABLE "public"."model_config" TO "authenticated";
GRANT ALL ON TABLE "public"."model_config" TO "service_role";

GRANT ALL ON FUNCTION "public"."touch_model_config"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_model_config"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_model_config"() TO "service_role";

INSERT INTO "public"."model_config" ("provider", "model") VALUES
    ('anthropic_haiku', 'claude-haiku-4-5-20251001'),
    ('anthropic_sonnet', 'claude-sonnet-4-6'),
    ('groq', 'llama-3.3-70b-versatile'),
    ('cerebras', 'gpt-oss-120b'),
    ('deepseek', 'deepseek-chat'),
    ('gemini', 'gemini-2.0-flash'),
    ('cloudflare', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'),
    ('openrouter', 'meta-llama/llama-3.3-70b-instruct:free'),
    ('mistral', 'mistral-small-latest')
ON CONFLICT ("provider") DO NOTHING;
