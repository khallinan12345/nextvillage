-- Drop the dated Haiku snapshot ID in favor of the generic current-Haiku ID.
-- Same model, same price — the generic ID just avoids silently falling
-- behind on quiet fixes Anthropic ships under the family ID.

ALTER TABLE "public"."profiles"
  ALTER COLUMN "ai_playground_model" SET DEFAULT 'claude-haiku-4-5'::"text";

UPDATE "public"."profiles"
  SET "ai_playground_model" = 'claude-haiku-4-5'
  WHERE "ai_playground_model" = 'claude-haiku-4-5-20251001';

UPDATE "public"."model_config"
  SET "model" = 'claude-haiku-4-5'
  WHERE "provider" = 'anthropic_haiku' AND "model" = 'claude-haiku-4-5-20251001';
