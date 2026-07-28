-- AI Image Creation / AI Video Production — let learners delete their own
-- generation history. Previously only INSERT/SELECT policies existed on
-- these tables (plus a service-role UPDATE for job status), so a DELETE
-- from the client was silently blocked by RLS with no policy permitting it.

CREATE POLICY "Users can delete their own image jobs" ON "public"."image_generations"
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own video jobs" ON "public"."video_generations"
  FOR DELETE USING (auth.uid() = user_id);
