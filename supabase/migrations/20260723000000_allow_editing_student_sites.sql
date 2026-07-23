-- "Website Builder" — students can now reopen and edit a previously
-- published site rather than only ever creating new ones. Saving an
-- edit upserts the student_sites row (same id, so the public URL never
-- changes) and replaces its pages wholesale (delete then reinsert,
-- matching how a fresh publish already works) rather than trying to
-- reconcile individual page rows, since pages can be added, removed, or
-- renamed between edits.

-- Owner can update their own site's title/updated_at on re-save. Org
-- membership isn't re-checked here since organization_id never changes
-- on an update — only the original insert needed that check.
CREATE POLICY "student_sites_update" ON "public"."student_sites"
  FOR UPDATE TO "authenticated"
  USING ("owner_id" = auth.uid())
  WITH CHECK ("owner_id" = auth.uid());

-- Owner can delete their own site's pages, to be immediately replaced
-- with the current set on re-save. Mirrors student_site_pages_insert's
-- "caller must be that site's owner" shape.
CREATE POLICY "student_site_pages_delete" ON "public"."student_site_pages"
  FOR DELETE TO "authenticated"
  USING (
    EXISTS (
      SELECT 1 FROM "public"."student_sites" s
      WHERE s.id = student_site_pages.site_id
        AND s.owner_id = auth.uid()
    )
  );
