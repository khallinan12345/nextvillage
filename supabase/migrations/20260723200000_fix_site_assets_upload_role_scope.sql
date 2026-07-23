-- Fix: image uploads to the "site-assets" bucket (Website Builder) have
-- never once succeeded — every attempt fails with "new row violates
-- row-level security policy", even for a correctly-authenticated user
-- uploading to their own folder.
--
-- Root cause, isolated by comparing every bucket in this project across
-- three factors (public flag / INSERT policy role scope / MIME-type
-- restriction) against actual upload history in storage.objects:
--
--   certificates    TO authenticated | public=true  | no mime restriction | WORKS (110 objects, most recent yesterday)
--   web-projects    TO authenticated | public=false | mime restricted     | WORKS (22 objects, most recent 3 weeks ago)
--   ai-images       TO public        | public=false | mime restricted    | WORKS (424 objects, most recent today)
--   site-assets     TO authenticated | public=true  | mime restricted    | NEVER WORKED (0 objects, ever)
--
-- site-assets is the only bucket in the project combining all three of
-- (a) an INSERT policy scoped `TO authenticated`, (b) a public bucket,
-- and (c) an `allowed_mime_types` restriction — confirmed reproducible
-- live via a real authenticated browser session (valid, verified JWT —
-- confirmed independently valid against PostgREST) using Chrome
-- automation: the Storage API's own POST to
-- /storage/v1/object/site-assets/... returned
-- {"statusCode":"403","error":"Unauthorized","message":"new row
-- violates row-level security policy"} even for a well-formed request
-- with a real, valid, unexpired session token and the correct anon key
-- (verified via SHA-256 comparison against the live deployed key).
-- A raw SQL simulation of the identical INSERT (SET LOCAL role
-- authenticated + matching request.jwt.claims) succeeds every time,
-- proving the WITH CHECK expression itself is correct — the failure is
-- specific to how Supabase's Storage service evaluates this particular
-- role/public/mime-restriction combination, not the policy logic.
--
-- ai-images (mime-restricted, public=false, works today) uses `TO
-- public` instead of `TO authenticated`, with the identical
-- foldername-ownership WITH CHECK. Switching site-assets to match this
-- proven-working scope changes nothing about the actual security
-- guarantee: an anonymous request still can't satisfy
-- `(storage.foldername(name))[1] = auth.uid()::text`, since auth.uid()
-- is NULL without a valid session — `TO public` only widens which
-- *role* the policy is even considered for, not what it allows.

DROP POLICY IF EXISTS "site_assets_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "site_assets_update_own" ON storage.objects;

CREATE POLICY "site_assets_insert_own" ON storage.objects
  FOR INSERT TO public
  WITH CHECK (
    bucket_id = 'site-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "site_assets_update_own" ON storage.objects
  FOR UPDATE TO public
  USING (
    bucket_id = 'site-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'site-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
