-- How each gift reached Impact Mining, Inc. before Impact Mining sent it to vAI through Sendwave.
-- Optional; entries picked up automatically from a Sendwave receipt start blank until the donor is named.

ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS channel text;
ALTER TABLE public.donations DROP CONSTRAINT IF EXISTS donations_channel_check;
ALTER TABLE public.donations ADD CONSTRAINT donations_channel_check
  CHECK (channel IS NULL OR channel IN ('bank_transfer', 'check', 'venmo', 'substack', 'gofundme', 'other'));
COMMENT ON COLUMN public.donations.channel IS 'How the gift reached Impact Mining, Inc.: bank_transfer, check, venmo, substack, gofundme or other. Optional.';

-- Board report: each item also carries its channel.
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
                         'amount_usd', amount_usd, 'purpose', purpose, 'channel', channel)
                       ORDER BY received_on, created_at) FROM m), '[]'::jsonb),
    'all_time_count', (SELECT count(*) FROM donations),
    'all_time_usd', (SELECT COALESCE(sum(amount_usd), 0) FROM donations)
  );
$$;
REVOKE ALL ON FUNCTION public.get_board_donations(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_board_donations(date) TO service_role;
