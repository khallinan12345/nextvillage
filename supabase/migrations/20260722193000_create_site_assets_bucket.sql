-- "Website Builder" image uploads (backgrounds, in-page images) — a
-- dedicated public bucket, separate from 'web-projects' (which is
-- zip/octet-stream only and not public — confirmed by direct testing,
-- not suitable for images despite WebDevelopmentPage.tsx's handleAssetUpload
-- assuming otherwise).
--
-- Public read (via the public: true flag, no SELECT policy needed) since
-- published sites are publicly viewable with no login — an <img> inside a
-- published page's HTML needs to load without any auth context. Insert/
-- update are restricted to each user's own folder (path prefix = their
-- auth.uid()), the standard Supabase per-user-storage-folder pattern.

INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES (
  'site-assets',
  'site-assets',
  true,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'],
  10485760 -- 10MB
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "site_assets_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'site-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "site_assets_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'site-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'site-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
