-- Diagnostic: test whether allowed_mime_types on a public bucket is the
-- actual cause of site-assets uploads failing. If this resolves it, will
-- be folded into a permanent migration; if not, will be reverted.
UPDATE storage.buckets SET allowed_mime_types = NULL WHERE id = 'site-assets';
