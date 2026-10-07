-- Remove pre-seeded placeholder rows from dashboard, keeping a full copy.
--
-- Every row is first copied into dashboard_placeholder_archive (same columns,
-- plus when it was archived), the copy is verified, and only then are the
-- originals deleted. The block aborts if any count does not match.
-- To undo: INSERT the archive rows (minus archived_at) back into dashboard.
-- Nothing with real content is touched: see dashboard_row_is_placeholder().
-- Applied to production on 2026-10-07 at Kevin's request ("the rows to be
-- deleted weren't actual sessions; they need to not be there").

CREATE TABLE IF NOT EXISTS public.dashboard_placeholder_archive (
  LIKE public.dashboard INCLUDING DEFAULTS
);
ALTER TABLE public.dashboard_placeholder_archive
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.dashboard_placeholder_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dashboard_placeholder_archive FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.dashboard_placeholder_archive TO service_role;

DO $$
DECLARE
  n_target   bigint;
  n_archived bigint;
  n_deleted  bigint;
BEGIN
  SELECT COUNT(*) INTO n_target
  FROM public.dashboard d
  WHERE public.dashboard_row_is_placeholder(d)
    AND NOT EXISTS (SELECT 1 FROM public.dashboard_placeholder_archive a WHERE a.id = d.id);

  INSERT INTO public.dashboard_placeholder_archive
  SELECT d.*, now()
  FROM public.dashboard d
  WHERE public.dashboard_row_is_placeholder(d)
    AND NOT EXISTS (SELECT 1 FROM public.dashboard_placeholder_archive a WHERE a.id = d.id);
  GET DIAGNOSTICS n_archived = ROW_COUNT;

  IF n_archived <> n_target THEN
    RAISE EXCEPTION 'archive mismatch: expected %, archived %', n_target, n_archived;
  END IF;

  DELETE FROM public.dashboard d
  WHERE public.dashboard_row_is_placeholder(d)
    AND EXISTS (SELECT 1 FROM public.dashboard_placeholder_archive a WHERE a.id = d.id);
  GET DIAGNOSTICS n_deleted = ROW_COUNT;

  IF n_deleted <> n_archived THEN
    RAISE EXCEPTION 'delete mismatch: archived %, deleted %', n_archived, n_deleted;
  END IF;
END $$;
