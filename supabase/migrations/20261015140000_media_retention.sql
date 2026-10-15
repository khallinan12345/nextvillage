-- Media and file retention (Kevin's decision, 2026-10-15): generated images, voices, videos, video
-- frames and Together attachments are deleted 12 months after they were stored, or 6 months for
-- learners whose birth year says they are under 13. No "pin" option exists yet.
--
-- Same under-13 test as purge_learner_content(): a recorded birth year within 13 years. A blank
-- birth year does NOT shorten the period, because deleting a file cannot be undone.
--
-- Storage files can only be removed through the Storage API (deleting the storage.objects row
-- leaves the file behind), so the purge-learner-media edge function does the deleting. These two
-- functions only decide what is due and tidy the database links afterwards. Service role only.

CREATE OR REPLACE FUNCTION public.media_purge_candidates(p_limit integer DEFAULT 500)
RETURNS TABLE(bucket_id text, name text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
  SELECT o.bucket_id::text, o.name::text, o.created_at
    FROM storage.objects o
   WHERE o.bucket_id IN ('ai-images', 'ai-videos', 'ai-voices', 'video-frames', 'together-assets')
     AND o.created_at < now() - interval '6 months'
     AND (
       o.created_at < now() - interval '12 months'
       OR (
         split_part(o.name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         AND EXISTS (
           SELECT 1 FROM profiles p
            WHERE p.id = split_part(o.name, '/', 1)::uuid
              AND p.birth_year >= extract(year FROM now())::int - 13
         )
       )
     )
   ORDER BY o.created_at
   LIMIT greatest(p_limit, 0);
$$;
REVOKE ALL ON FUNCTION public.media_purge_candidates(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_purge_candidates(integer) TO service_role;

-- After files are gone, clear the links that pointed at them so the app shows "no image" instead
-- of a broken one. Links hold the path inside a signed or public URL (spaces and brackets may be
-- percent-encoded), so compare after undoing that.
CREATE OR REPLACE FUNCTION public.media_purge_clear_references(p_bucket text, p_names text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  nm text;
  needle text;
  n integer := 0;
  c integer;
BEGIN
  FOREACH nm IN ARRAY p_names LOOP
    needle := '/' || p_bucket || '/' || nm;
    IF p_bucket = 'ai-images' THEN
      UPDATE image_generations SET saved_image_url = NULL
       WHERE saved_image_url IS NOT NULL
         AND position(needle IN replace(replace(replace(saved_image_url, '%20', ' '), '%28', '('), '%29', ')')) > 0;
    ELSIF p_bucket = 'ai-videos' THEN
      UPDATE video_generations SET saved_video_url = NULL
       WHERE saved_video_url IS NOT NULL
         AND position(needle IN replace(replace(replace(saved_video_url, '%20', ' '), '%28', '('), '%29', ')')) > 0;
    ELSIF p_bucket = 'ai-voices' THEN
      UPDATE voice_generations SET saved_audio_url = NULL
       WHERE saved_audio_url IS NOT NULL
         AND position(needle IN replace(replace(replace(saved_audio_url, '%20', ' '), '%28', '('), '%29', ')')) > 0;
    ELSIF p_bucket = 'together-assets' THEN
      UPDATE together_messages SET image_url = NULL
       WHERE image_url IS NOT NULL
         AND position(needle IN replace(replace(replace(image_url, '%20', ' '), '%28', '('), '%29', ')')) > 0;
    ELSE
      c := 0;
    END IF;
    GET DIAGNOSTICS c = ROW_COUNT;
    n := n + c;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.media_purge_clear_references(text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_purge_clear_references(text, text[]) TO service_role;

-- A random shared secret, generated here and stored where only the service role can read it. The
-- nightly job sends it to the edge function, which checks it, so nobody else can trigger a purge.
CREATE TABLE IF NOT EXISTS public.retention_job_secret (
  id     boolean PRIMARY KEY DEFAULT true CHECK (id),
  secret text NOT NULL
);
ALTER TABLE public.retention_job_secret ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.retention_job_secret FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.retention_job_secret TO service_role;
INSERT INTO public.retention_job_secret (secret)
  VALUES (replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  ON CONFLICT (id) DO NOTHING;

-- The nightly schedule ('purge-learner-media', 04:00 UTC) is registered separately in the database;
-- it reads the secret above at run time and calls the purge-learner-media edge function.
