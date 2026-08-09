-- "Systems Think" — thinking artifact.
--
-- Mirrors together_rooms.book_content: a single canonical document, rewritten
-- in full by the model via tool-use (see api/systems-think.js) whenever the
-- conversation produces something worth capturing, rather than reconstructed
-- from chat fragments. Attachments (images/text files) are stored inline
-- within systems_think_sessions.messages (jsonb) — no separate storage
-- bucket needed, since this is single-user data rather than shared room
-- assets.

ALTER TABLE "public"."systems_think_sessions"
  ADD COLUMN IF NOT EXISTS "artifact_content"    text,
  ADD COLUMN IF NOT EXISTS "artifact_updated_at" timestamp with time zone;
