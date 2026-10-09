-- Move the Haiku tier from claude-haiku-4-5 to claude-haiku-5-5 (about a tenth of the price).
-- Apply AFTER the code that no longer sends `temperature` to Haiku is deployed.

ALTER TABLE "public"."profiles"
  ALTER COLUMN "ai_playground_model" SET DEFAULT 'claude-haiku-5-5'::"text";

UPDATE "public"."profiles"
  SET "ai_playground_model" = 'claude-haiku-5-5'
  WHERE "ai_playground_model" = 'claude-haiku-4-5';

UPDATE "public"."model_config"
  SET "model" = 'claude-haiku-5-5'
  WHERE "provider" = 'anthropic_haiku' AND "model" = 'claude-haiku-4-5';
