-- "Use Claude Together" — image sharing.
--
-- Lets a room member upload an image (e.g. a chapter-book illustration)
-- that shows up in the chat and in the compiled "book" artifact view.
-- Uploads are proxied through api/upload-together-asset.js using the
-- service-role key (same rationale as site-assets — see
-- 20260722193000_create_site_assets_bucket.sql and
-- api/upload-site-asset.js's writeup on why direct client uploads to
-- Storage unreliably fail RLS in this project), so no authenticated INSERT
-- policy is needed on storage.objects for this bucket at all.

ALTER TABLE "public"."together_messages"
  ADD COLUMN IF NOT EXISTS "image_url" text;

INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES (
  'together-assets',
  'together-assets',
  true,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'],
  10485760 -- 10MB
)
ON CONFLICT (id) DO NOTHING;
