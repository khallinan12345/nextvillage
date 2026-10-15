-- Privacy requests from learners (or a parent/guardian speaking for them): delete my data,
-- withdraw consent, send me a copy. The request is recorded and shown to the leaders of the
-- person's organization and to administrators. A leader can lock the account straight away
-- (review_membership 'declined'); the actual erasure is still done by an administrator
-- (npm run user:delete) within 30 days. Writes go only through the functions below.

CREATE TABLE IF NOT EXISTS public.data_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  kind            text NOT NULL CHECK (kind IN ('delete_account', 'withdraw_consent', 'copy_of_data')),
  note            text CHECK (note IS NULL OR char_length(note) <= 1000),
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'declined')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  handled_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  handled_at      timestamptz,
  handled_note    text CHECK (handled_note IS NULL OR char_length(handled_note) <= 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS data_requests_one_open_per_kind
  ON public.data_requests (user_id, kind) WHERE status = 'open';

ALTER TABLE public.data_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.data_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.data_requests TO authenticated;
DROP POLICY IF EXISTS own_requests ON public.data_requests;
CREATE POLICY own_requests ON public.data_requests FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Submit a request about my own data.
CREATE OR REPLACE FUNCTION public.request_data_action(p_kind text, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF p_kind NOT IN ('delete_account', 'withdraw_consent', 'copy_of_data') THEN
    RAISE EXCEPTION 'Unknown request type';
  END IF;
  INSERT INTO data_requests (user_id, organization_id, kind, note)
  SELECT p.id, coalesce(p.organization_id, org_id_for_join_code(p.join_code_used)), p_kind, left(p_note, 1000)
    FROM profiles p WHERE p.id = auth.uid()
  ON CONFLICT (user_id, kind) WHERE status = 'open' DO NOTHING
  RETURNING id INTO new_id;
  IF new_id IS NULL THEN
    SELECT id INTO new_id FROM data_requests WHERE user_id = auth.uid() AND kind = p_kind AND status = 'open';
  END IF;
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.request_data_action(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_data_action(text, text) TO authenticated;

-- Can the caller handle requests for this organization? Administrators, the organization's
-- leader_id, or an approved leader / site_leader of it (same test as review_membership).
CREATE OR REPLACE FUNCTION public.can_handle_requests_for(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles me
     WHERE me.id = auth.uid()
       AND (
            me.role::text = 'platform_administrator'
         OR (p_org IS NOT NULL AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = p_org AND o.leader_id = me.id))
         OR (p_org IS NOT NULL AND me.membership_status = 'approved'
             AND me.role::text IN ('site_leader', 'leader') AND me.organization_id = p_org)
       )
  );
$$;
REVOKE ALL ON FUNCTION public.can_handle_requests_for(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_handle_requests_for(uuid) TO authenticated;

-- Open requests the caller may handle.
CREATE OR REPLACE FUNCTION public.list_open_data_requests()
RETURNS TABLE(id uuid, user_id uuid, kind text, note text, created_at timestamptz,
              learner_name text, learner_email text, organization_name text, birth_year smallint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.user_id, r.kind, r.note, r.created_at, p.name, p.email, o.name, p.birth_year
    FROM data_requests r
    JOIN profiles p ON p.id = r.user_id
    LEFT JOIN organizations o ON o.id = r.organization_id
   WHERE r.status = 'open' AND public.can_handle_requests_for(r.organization_id)
   ORDER BY r.created_at;
$$;
REVOKE ALL ON FUNCTION public.list_open_data_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_open_data_requests() TO authenticated;

-- Mark a request handled ('done') or refused ('declined', with a reason).
CREATE OR REPLACE FUNCTION public.resolve_data_request(p_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org uuid;
BEGIN
  IF p_status NOT IN ('done', 'declined') THEN RAISE EXCEPTION 'status must be done or declined'; END IF;
  SELECT organization_id INTO org FROM data_requests WHERE id = p_id AND status = 'open';
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or already handled'; END IF;
  IF NOT public.can_handle_requests_for(org) THEN
    RAISE EXCEPTION 'Only a leader of this organization can handle this request';
  END IF;
  UPDATE data_requests
     SET status = p_status, handled_by = auth.uid(), handled_at = now(), handled_note = left(p_note, 1000)
   WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_data_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_data_request(uuid, text, text) TO authenticated;
