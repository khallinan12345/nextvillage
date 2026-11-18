-- Donations to vAI. Every donation arrives from Impact Mining, Inc. through Sendwave, and Kevin
-- (a platform administrator) records each one by hand: Sendwave has no API or webhook, so the platform
-- cannot see transfers on its own. `donor_name` is the person or organization being thanked (the one
-- who gave to Impact Mining, Inc.); the conduit is always Impact Mining, Inc.
--
-- Who can do what:
--   read / write the table   platform administrators write; leaders (vAI leaders) and platform admins read
--   donor wall (public)      get_donor_wall(): ONLY rows where show_on_wall = true (opt-in, default false),
--                            and only the name, how it should read on the wall, and the month. Never the
--                            amount, email, Sendwave reference, purpose or notes.
--   board report             get_board_donations(month): used by api/board-monthly-report.ts (service role)

CREATE TABLE IF NOT EXISTS public.donations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_on date NOT NULL,
  donor_name text NOT NULL CHECK (length(btrim(donor_name)) > 0),
  donor_email text,
  amount_usd numeric(12, 2) NOT NULL CHECK (amount_usd > 0),
  amount_received numeric(14, 2) CHECK (amount_received IS NULL OR amount_received > 0),
  received_currency text CHECK (received_currency IS NULL OR received_currency ~ '^[A-Z]{3}$'),
  sendwave_reference text,
  purpose text,
  notes text,
  show_on_wall boolean NOT NULL DEFAULT false,
  wall_name text,
  recorded_by uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.donations IS 'Donations to vAI, all sent by Impact Mining, Inc. via Sendwave and entered by hand. donor_name is who is being acknowledged. Private: leaders and platform admins read; platform admins write. Public donor wall only via get_donor_wall() and only where show_on_wall.';
COMMENT ON COLUMN public.donations.amount_usd IS 'USD amount Impact Mining, Inc. sent.';
COMMENT ON COLUMN public.donations.amount_received IS 'What vAI actually received after Sendwave fees and conversion, in received_currency. Optional.';
COMMENT ON COLUMN public.donations.show_on_wall IS 'Opt-in. Only true once the donor has agreed to be named publicly.';
COMMENT ON COLUMN public.donations.wall_name IS 'How the name should read on the public wall (e.g. "The Smith Family"). Falls back to donor_name.';

CREATE INDEX IF NOT EXISTS donations_received_on_idx ON public.donations (received_on DESC);
CREATE UNIQUE INDEX IF NOT EXISTS donations_sendwave_reference_key ON public.donations (sendwave_reference) WHERE sendwave_reference IS NOT NULL;

CREATE OR REPLACE FUNCTION public.donations_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS donations_touch ON public.donations;
CREATE TRIGGER donations_touch BEFORE UPDATE ON public.donations FOR EACH ROW EXECUTE FUNCTION public.donations_touch();
REVOKE ALL ON FUNCTION public.donations_touch() FROM PUBLIC, anon, authenticated;

-- Role checks. SECURITY DEFINER so RLS on profiles does not get in the way (same pattern as is_platform_team).
CREATE OR REPLACE FUNCTION public.can_read_donations() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role::text IN ('platform_administrator', 'leader'));
$$;
CREATE OR REPLACE FUNCTION public.can_write_donations() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role::text = 'platform_administrator');
$$;
REVOKE ALL ON FUNCTION public.can_read_donations(), public.can_write_donations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_donations(), public.can_write_donations() TO authenticated, service_role;

ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS donations_select ON public.donations;
DROP POLICY IF EXISTS donations_insert ON public.donations;
DROP POLICY IF EXISTS donations_update ON public.donations;
DROP POLICY IF EXISTS donations_delete ON public.donations;
CREATE POLICY donations_select ON public.donations FOR SELECT TO authenticated USING (public.can_read_donations());
CREATE POLICY donations_insert ON public.donations FOR INSERT TO authenticated WITH CHECK (public.can_write_donations());
CREATE POLICY donations_update ON public.donations FOR UPDATE TO authenticated USING (public.can_write_donations()) WITH CHECK (public.can_write_donations());
CREATE POLICY donations_delete ON public.donations FOR DELETE TO authenticated USING (public.can_write_donations());

-- anon/authenticated get automatic grants on new tables, so revoke per role, then grant only what is used.
REVOKE ALL ON public.donations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.donations TO authenticated;
GRANT ALL ON public.donations TO service_role;

-- Public donor wall: opted-in names only, no amounts.
CREATE OR REPLACE FUNCTION public.get_donor_wall()
RETURNS TABLE (display_name text, month_start date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT COALESCE(NULLIF(btrim(d.wall_name), ''), btrim(d.donor_name)) AS display_name,
         date_trunc('month', d.received_on)::date AS month_start
  FROM donations d
  WHERE d.show_on_wall
  ORDER BY d.received_on DESC, d.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_donor_wall() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_donor_wall() TO anon, authenticated, service_role;

-- Monthly numbers for the board report. Called with the service role only.
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
      SELECT jsonb_agg(jsonb_build_object('received_on', received_on, 'donor', donor_name, 'amount_usd', amount_usd, 'purpose', purpose)
                       ORDER BY received_on, created_at) FROM m), '[]'::jsonb),
    'all_time_count', (SELECT count(*) FROM donations),
    'all_time_usd', (SELECT COALESCE(sum(amount_usd), 0) FROM donations)
  );
$$;
REVOKE ALL ON FUNCTION public.get_board_donations(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_board_donations(date) TO service_role;
