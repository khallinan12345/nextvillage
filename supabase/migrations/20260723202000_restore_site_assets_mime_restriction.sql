-- Restores the allowed_mime_types restriction removed in the previous
-- migration during diagnosis (it turned out not to be the actual cause
-- of upload failures — see 20260723210000_route_site_asset_uploads_through_server.sql
-- for the real fix and root-cause writeup). Keeping the restriction as a
-- defense-in-depth safeguard even though uploads are now server-side.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/png','image/jpeg','image/jpg','image/gif','image/webp','image/svg+xml']
WHERE id = 'site-assets';
