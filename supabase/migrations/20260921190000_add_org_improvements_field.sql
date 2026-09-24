-- Site-leader onboarding: what a community would want to see improved or
-- added in nextVillage itself. Optional, fillable at signup or later.

ALTER TABLE "public"."organizations"
  ADD COLUMN IF NOT EXISTS "improvements_to_next_village" "text";
