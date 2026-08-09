-- "Use Claude Together" — canonical book document.
--
-- The marker-based approach (Claude self-tagging <<<BOOK_START>>> blocks
-- inline in free-form chat replies, see 20260725150000's companion PR)
-- proved unreliable across long, iterative editing sessions — once a
-- conversation runs many turns of "expand this", "continue", "make it
-- longer", the model can drift away from the tagging convention entirely,
-- silently breaking the artifact for the rest of the session.
--
-- Replacing that with a single canonical document column that api/chat-room.js
-- rewrites in full on every turn that touches it (never a diff/fragment),
-- with the current content always passed back into context — so state lives
-- in the database, not in the model's adherence to a formatting convention
-- across dozens of turns.

ALTER TABLE "public"."together_rooms"
  ADD COLUMN IF NOT EXISTS "book_content"    text,
  ADD COLUMN IF NOT EXISTS "book_updated_at" timestamp with time zone;
