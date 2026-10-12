-- Stop anonymous visitors from LISTING files in three public buckets.
--
-- certificates (certificate PDFs, named <user-id>/<certificate>.pdf), video-frames
-- and web-dev-images each had a "public SELECT" policy on storage.objects. Because
-- those buckets are marked public, files are already fetchable by direct URL without
-- any policy; the SELECT policy only added the ability for anyone on the internet to
-- enumerate every file name through the storage API (which for certificates also
-- reveals every learner's user id). Dropping it keeps every existing link working
-- (the app only uses getPublicUrl for these buckets) and removes the enumeration.

DROP POLICY IF EXISTS "Allow public read access" ON storage.objects;
DROP POLICY IF EXISTS "Public can read frames" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for web-dev-images" ON storage.objects;
