-- "Create Game" — let a student save progress on a game and reopen it
-- later to keep improving it, same pattern as student_sites
-- (20260723000000_allow_editing_student_sites.sql). Unlike
-- together_rooms, student_games has no leader-only-gated field to
-- protect, so a plain owner-only UPDATE policy is sufficient — no
-- SECURITY DEFINER helper needed here.
CREATE POLICY "student_games_update" ON "public"."student_games"
  FOR UPDATE TO "authenticated"
  USING ("owner_id" = auth.uid())
  WITH CHECK ("owner_id" = auth.uid());
