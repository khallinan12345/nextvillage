-- Site-leader onboarding: educational goals, community assets, data-retention
-- preference, and which learning tools a site wants enabled for its learners.
-- All optional — a leader can sign up without filling these in and complete
-- them later from their Profile page.

ALTER TABLE "public"."organizations"
  ADD COLUMN IF NOT EXISTS "educational_goals" "text",
  ADD COLUMN IF NOT EXISTS "community_assets" "text",
  ADD COLUMN IF NOT EXISTS "data_retention_preference" "text",
  ADD COLUMN IF NOT EXISTS "enabled_tools" "text"[] DEFAULT '{}'::"text"[] NOT NULL;
