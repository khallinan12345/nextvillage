-- "Use Claude Together" — safety flags and a Report button.
--
-- Students' messages are inserted straight from the browser (RLS-checked),
-- and api/chat-room.js is only called afterwards to get Claude's reply, so a
-- check living in the API could simply be skipped. The check therefore runs
-- here, in a trigger on together_messages, where every message passes.
--
--   * together_message_safety_categories() looks for the signs of someone
--     trying to move a young person off the platform: phone numbers, email
--     addresses, "WhatsApp me", job/travel offers abroad, money or bank
--     details, secrecy, meeting up, asking for photos. Rooms keep working —
--     a match never blocks or hides the message, it records a flag.
--   * report_together_message() lets any member of the room report a
--     message (one report per message per person).
--   * Each new flag pings /api/notify-safety-flags via pg_net, which emails
--     the organization's leaders. That endpoint only ever sends flags not yet
--     emailed, so it needs no secret; a pg_cron job retries every 10 minutes
--     in case a ping is lost.
--   * Leaders see open flags on their dashboard (SafetyFlagsCard) and mark
--     them reviewed with review_together_safety_flag().
--
-- Patterns were checked against all 826 existing student messages before
-- shipping: none of them is flagged.

-- ── 1. What counts as a flag ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.together_message_safety_categories(msg text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(cat ORDER BY cat), '{}')
  FROM (
    -- Phone numbers (9–15 digits, spaces/dots/dashes allowed between — a
    -- longer run is key-mashing, not a number), email addresses, and
    -- requests to move the chat to a private app.
    SELECT 'contact_off_platform' AS cat
    WHERE msg ~* '(\+|\m)\d([\s.()-]{0,2}\d){8,14}\M'
       OR msg ~* '[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z.]{2,}'
       OR msg ~* '\m(whats\s?app|watsapp|wa\.me|telegram|t\.me|snap\s?chat|signal app)'
       OR msg ~* '\m(dm|pm|inbox|text|message|chat)\s+me\M'
       OR msg ~* '\m(call|reach|ping|add)\s+me\s+(on|at|via)\M'
       OR msg ~* '\m(my|your|ur)\s+(phone\s+)?(number|digits|contact|handle)\M'
    UNION ALL
    -- Job, travel or sponsorship offers abroad — a common trafficking lure.
    SELECT 'job_or_travel_offer'
    WHERE msg ~* '\m(japa|visa|passport)\M'
       OR msg ~* '\m(job|work|employ|opportunit|salary|sponsor|agent|recruit|ticket)\w*\W+(\w+\W+){0,6}(abroad|overseas)\M'
       OR msg ~* '\m(abroad|overseas)\W+(\w+\W+){0,6}(job|work|employ|opportunit|salary|sponsor|agent|recruit|ticket)'
    UNION ALL
    -- Asking for or offering money, airtime or bank details.
    SELECT 'money_request'
    WHERE msg ~* '\m(send|transfer|give|lend|borrow|pay)\M\W+(\w+\W+){0,4}(money|cash|naira|airtime|recharge|funds?)\M'
       OR msg ~* '\m(account|acct)\s+(number|no|details)\M'
       OR msg ~* '\mbank\s+(details|account|info)'
       OR msg ~* '\m(opay|palmpay|moniepoint|recharge\s+card)\M'
       OR msg ~ '₦'
    UNION ALL
    -- Secrecy, meeting up, or asking for photos/location — grooming signs.
    -- Checked only on short messages: these phrases turn up in the long
    -- story chapters students paste in, where they're dialogue, not contact.
    SELECT 'secrecy_or_meeting'
    WHERE length(msg) <= 500 AND (msg ~* '\mdon''?t\s+tell\s+(anyone|anybody|nobody|your|ur)\M'
       OR msg ~* '\m(keep\s+(it|this)\s+(a\s+)?secret|our\s+(little\s+)?secret|between\s+you\s+and\s+me)\M'
       OR msg ~* '\m(meet\s+me|let''?s\s+meet|come\s+alone|where\s+do\s+you\s+live|your\s+address)\M'
       OR msg ~* '\msend\s+(me\s+)?(a\s+|your\s+)?(pic|pics|photo|photos|picture|pictures|selfie)\M')
  ) hits;
$$;

-- ── 2. Flags table ────────────────────────────────────────────────────────
-- Room/message/sender links are SET NULL, not CASCADE, and the room name,
-- sender name and text are copied in: whoever created a room can delete it,
-- and that must not erase the record of what was said in it.
CREATE TABLE IF NOT EXISTS public.together_safety_flags (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  room_id         uuid REFERENCES public.together_rooms(id) ON DELETE SET NULL,
  room_name       text,
  message_id      uuid REFERENCES public.together_messages(id) ON DELETE SET NULL,
  sender_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_name     text,
  excerpt         text NOT NULL,
  source          text NOT NULL CHECK (source IN ('auto', 'report')),
  categories      text[] NOT NULL DEFAULT '{}',
  reported_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  report_reason   text,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed')),
  reviewed_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  emailed_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS together_safety_flags_org_status_idx
  ON public.together_safety_flags (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS together_safety_flags_unsent_idx
  ON public.together_safety_flags (created_at) WHERE emailed_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS together_safety_flags_one_report_idx
  ON public.together_safety_flags (message_id, reported_by) WHERE source = 'report';

ALTER TABLE public.together_safety_flags ENABLE ROW LEVEL SECURITY;
-- Supabase auto-grants new tables to anon/authenticated; revoke explicitly.
-- Leaders only read; all writes go through the functions below or the
-- service role (api/notify-safety-flags.js stamps emailed_at).
REVOKE ALL ON public.together_safety_flags FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.together_safety_flags TO authenticated;

-- Same leader check as review_membership(): platform administrator, the
-- org's registered leader, or an approved leader/co-leader of the org.
CREATE OR REPLACE FUNCTION public.leads_organization(target_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND (
           p.role::text = 'platform_administrator'
        OR (p.membership_status = 'approved'
            AND p.role::text IN ('site_leader', 'leader')
            AND p.organization_id = target_org)
      )
  ) OR EXISTS (
    SELECT 1 FROM organizations o WHERE o.id = target_org AND o.leader_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.leads_organization(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leads_organization(uuid) TO authenticated;

DROP POLICY IF EXISTS together_safety_flags_select ON public.together_safety_flags;
CREATE POLICY together_safety_flags_select ON public.together_safety_flags
  FOR SELECT TO authenticated
  USING (public.leads_organization(organization_id));

-- ── 3. Automatic check on every student message ──────────────────────────
CREATE OR REPLACE FUNCTION public.together_messages_safety_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cats text[];
BEGIN
  IF NEW.role <> 'user' OR coalesce(NEW.content, '') = '' THEN
    RETURN NULL;
  END IF;

  -- Never let a problem here stop a message from being sent.
  BEGIN
    cats := together_message_safety_categories(NEW.content);
    IF cardinality(cats) > 0 THEN
      INSERT INTO together_safety_flags
        (organization_id, room_id, room_name, message_id, sender_id, sender_name, excerpt, source, categories)
      SELECT r.organization_id, r.id, r.name, NEW.id, NEW.sender_id, NEW.sender_name,
             left(NEW.content, 2000), 'auto', cats
      FROM together_rooms r WHERE r.id = NEW.room_id;
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'together safety check failed for message %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.together_messages_safety_check() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS together_messages_safety_check ON public.together_messages;
CREATE TRIGGER together_messages_safety_check
  AFTER INSERT ON public.together_messages
  FOR EACH ROW EXECUTE FUNCTION public.together_messages_safety_check();

-- ── 4. Report button ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.report_together_message(p_message_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  msg  together_messages%ROWTYPE;
  room together_rooms%ROWTYPE;
  me   record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Please sign in to report a message';
  END IF;

  SELECT * INTO msg FROM together_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found';
  END IF;
  SELECT * INTO room FROM together_rooms WHERE id = msg.room_id;

  -- Only someone who can see the room can report in it (same rule as the
  -- together_messages_select policy). A pending member has no org (NULL),
  -- so compare with coalesce — NOT (NULL) would let them through.
  SELECT * INTO me FROM get_my_effective_profile();
  IF NOT coalesce(me.role = 'platform_administrator' OR me.organization_id = room.organization_id, false) THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  IF msg.sender_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot report your own message';
  END IF;

  INSERT INTO together_safety_flags
    (organization_id, room_id, room_name, message_id, sender_id, sender_name, excerpt,
     source, reported_by, report_reason)
  VALUES
    (room.organization_id, room.id, room.name, msg.id, msg.sender_id, msg.sender_name,
     left(CASE WHEN msg.image_url IS NOT NULL
               THEN concat_ws(' ', '[image]', msg.image_url, nullif(msg.content, ''))
               ELSE msg.content END, 2000),
     'report', auth.uid(), nullif(left(trim(coalesce(p_reason, '')), 500), ''))
  ON CONFLICT (message_id, reported_by) WHERE source = 'report' DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.report_together_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_together_message(uuid, text) TO authenticated;

-- ── 5. Leader marks a flag reviewed ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.review_together_safety_flag(p_flag_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  flag_org uuid;
BEGIN
  SELECT organization_id INTO flag_org FROM together_safety_flags WHERE id = p_flag_id;
  IF flag_org IS NULL OR NOT leads_organization(flag_org) THEN
    RAISE EXCEPTION 'Only a leader of this organization can review its safety flags';
  END IF;

  UPDATE together_safety_flags
     SET status = 'reviewed', reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = p_flag_id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_together_safety_flag(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_together_safety_flag(uuid) TO authenticated;

-- ── 6. Email the leaders ─────────────────────────────────────────────────
-- pg_net queues the request and returns at once, so this never slows down
-- sending a message. One ping per statement, however many flags it added.
CREATE OR REPLACE FUNCTION public.together_safety_flags_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url     := 'https://www.nextvillage.community/api/notify-safety-flags',
      body    := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'could not queue safety flag email: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.together_safety_flags_notify() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS together_safety_flags_notify ON public.together_safety_flags;
CREATE TRIGGER together_safety_flags_notify
  AFTER INSERT ON public.together_safety_flags
  FOR EACH STATEMENT EXECUTE FUNCTION public.together_safety_flags_notify();

-- Retry: if a ping was lost, send whatever is still waiting. Does nothing
-- (no request at all) when every flag has been emailed.
SELECT cron.unschedule('notify-together-safety-flags')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-together-safety-flags');

SELECT cron.schedule(
  'notify-together-safety-flags',
  '*/10 * * * *',
  $cron$
    SELECT net.http_post(
      url     := 'https://www.nextvillage.community/api/notify-safety-flags',
      body    := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb
    )
    WHERE EXISTS (
      SELECT 1 FROM public.together_safety_flags
      WHERE emailed_at IS NULL AND created_at > now() - interval '1 day'
    );
  $cron$
);
