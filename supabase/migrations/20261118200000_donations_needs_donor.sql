-- Sendwave receipts are picked up automatically (api/donation-intake.ts) and create a donation that still
-- needs the donor's name. Such rows are flagged needs_donor, can never appear on the public donor wall, and
-- the owner is emailed a link to complete them (daily reminder via api/donation-reminders.ts until done).

ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS needs_donor boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.donations.needs_donor IS 'True for entries created from a Sendwave receipt until someone adds the donor name. Never shown on the donor wall.';

ALTER TABLE public.donations DROP CONSTRAINT IF EXISTS donations_needs_donor_not_public;
ALTER TABLE public.donations ADD CONSTRAINT donations_needs_donor_not_public CHECK (NOT (needs_donor AND show_on_wall));

CREATE INDEX IF NOT EXISTS donations_needs_donor_idx ON public.donations (created_at) WHERE needs_donor;

-- The wall also excludes needs_donor rows directly (belt and braces with the check above).
CREATE OR REPLACE FUNCTION public.get_donor_wall()
RETURNS TABLE (display_name text, month_start date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT COALESCE(NULLIF(btrim(d.wall_name), ''), btrim(d.donor_name)) AS display_name,
         date_trunc('month', d.received_on)::date AS month_start
  FROM donations d
  WHERE d.show_on_wall AND NOT d.needs_donor
  ORDER BY d.received_on DESC, d.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_donor_wall() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_donor_wall() TO anon, authenticated, service_role;

-- Board report: a donation still missing its donor name is listed as such rather than left out.
CREATE OR REPLACE FUNCTION public.get_board_donations(p_month_start date)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH m AS (
    SELECT * FROM donations
    WHERE received_on >= p_month_start AND received_on < (p_month_start + interval '1 month')::date
  )
  SELECT jsonb_build_object(
    'month_start', p_month_start,
    'count', (SELECT count(*) FROM m),
    'total_usd', (SELECT COALESCE(sum(amount_usd), 0) FROM m),
    'received_by_currency', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('currency', t.c, 'amount', t.a) ORDER BY t.c)
      FROM (SELECT received_currency AS c, sum(amount_received) AS a FROM m
            WHERE amount_received IS NOT NULL AND received_currency IS NOT NULL GROUP BY received_currency) t), '[]'::jsonb),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('received_on', received_on,
                         'donor', CASE WHEN needs_donor THEN 'Donor not yet recorded' ELSE donor_name END,
                         'amount_usd', amount_usd, 'purpose', purpose)
                       ORDER BY received_on, created_at) FROM m), '[]'::jsonb),
    'all_time_count', (SELECT count(*) FROM donations),
    'all_time_usd', (SELECT COALESCE(sum(amount_usd), 0) FROM donations)
  );
$$;
REVOKE ALL ON FUNCTION public.get_board_donations(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_board_donations(date) TO service_role;
