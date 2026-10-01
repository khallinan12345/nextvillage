-- Daily report now tracks a pure sign-in count (separate from the
-- activity-union "active_users") and splits the former catch-all "other"
-- bucket into the real site areas it was hiding: Foundations (English/
-- Math/Science), Community Impact, Media Generation (image/video/voice),
-- and Specialized Tracks (Financial Literacy, Solar Engineering).

ALTER TABLE "public"."daily_activity_log"
  ADD COLUMN IF NOT EXISTS "signed_in_today" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "cat_foundations" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "cat_community_impact" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "cat_media_generation" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "cat_specialized_tracks" integer DEFAULT 0 NOT NULL;

COMMENT ON COLUMN "public"."daily_activity_log"."cat_english_skills" IS 'Deprecated: superseded by cat_foundations (English/Math/Science combined). Kept for historical rows.';
