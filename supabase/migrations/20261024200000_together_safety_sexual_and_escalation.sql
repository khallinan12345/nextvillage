-- Together Room safety: sexual content, and a look at the sender's recent messages.
--
-- Added after a security review of peer chat found two gaps in the 5 October check
-- (20261005021247_together_room_safety_flags.sql):
--   1. no category for sexual content, and
--   2. every message was judged alone, so a conversation that escalates slowly ("how old are you",
--      "are you alone", "you are so beautiful"...) never tripped it.
--
-- Same rules as before: a match never blocks or hides a message, it records a flag, and the existing
-- flag trigger emails the organization's leaders. Nothing about who is emailed changes.
--
--   * together_message_safety_categories() gains 'sexual_content'. Like the secrecy/meeting checks it only
--     looks at short messages (500 characters or fewer), because long story chapters students paste in
--     contain dialogue and biology/health words that are not contact. Ambiguous words (cock, dick, cum,
--     naked on its own, virgin, toto) are left out on purpose: they are also farm animals, names, Latin,
--     "naked eye" and a dog in a famous book. Local slang needs a list reviewed by the leaders who know it.
--   * together_weak_signals() lists softer warning signs that are harmless alone: asking age, asking whether
--     the child is alone or where parents are, asking about boyfriends/girlfriends, compliments on looks or
--     body, offers of gifts, and "just between us" language.
--   * The message trigger now also looks at the same sender's last 6 short messages in the same room in the
--     last 24 hours. When those show three or more different kinds of warning sign, and this message adds
--     one, it records one 'escalating_pattern' flag (at most one per sender and room per 24 hours) whose
--     excerpt is those recent messages, so a leader sees the whole conversation.
--
-- Both checks sit in their own exception handlers: a problem here never stops a message from being sent,
-- and a failure in one check does not skip the other.

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
    UNION ALL
    -- Sexual content or a sexual request. Short messages only (see the note at the top of this file).
    SELECT 'sexual_content'
    WHERE length(msg) <= 500 AND (
          msg ~* '\m(porn\w*|nudes?|horny|blow\s?job|hand\s?job|masturbat\w*|orgasm\w*|sexting|sext|sexy|xxx|pussy|boobs?|nipples?|ashawo|sex)\M'
       OR msg ~* '\m(have|having|do|doing|make|making)\s+(sex|love)\M'
       OR msg ~* '\msleep\s+(with|together)\M'
       OR msg ~* '\mfuck(ing)?\s+(me|you|u|her|him)\M'
       OR msg ~* '\m(your|ur)\s+(breasts?|private\s+parts?)\M'
       OR msg ~* '\m(take|pull)\s+off\s+(your|ur)\s+(clothes|bra|panties|underwear|pants|shirt|dress)\M'
       OR msg ~* '\m(remove|show)\s+(your|ur)\s+(bra|panties|underwear|breasts?)\M'
       OR msg ~* '\mnaked\s+(pic|pics|photo|photos|picture|pictures|video|body)\M'
       OR msg ~* '\msexual\W+(act|acts|activity|content|video|videos|pic|pics|photo|photos|chat|talk)\M')
  ) hits;
$$;

-- Softer warning signs that mean little alone but matter together. Returns the kinds present in msg.
CREATE OR REPLACE FUNCTION public.together_weak_signals(msg text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(sig ORDER BY sig), '{}')
  FROM (
    SELECT 'age_question' AS sig
    WHERE length(msg) <= 500 AND (
          msg ~* '\mhow\s+old\s+(are|r)\s+(you|u)\M'
       OR msg ~* '\mwhat(''?s|\s+is)\s+(your|ur)\s+age\M'
       OR msg ~* '\mare\s+(you|u)\s+(a\s+)?(minor|virgin|underage)\M')
    UNION ALL
    SELECT 'alone_question'
    WHERE length(msg) <= 500 AND (
          msg ~* '\mare\s+(you|u)\s+(alone|by\s+yourself|home\s+alone)\M'
       OR msg ~* '\m(anyone|anybody|who)\W+(\w+\W+){0,2}(with|around|near|at\s+home)\s+(you|u|home)\M'
       OR msg ~* '\m(your|ur)\s+(parents?|mum|mom|mother|dad|father|guardian)\W+(\w+\W+){0,2}(home|around|there|asleep|out|away)\M')
    UNION ALL
    SELECT 'romance'
    WHERE length(msg) <= 500 AND (
          msg ~* '\m(boyfriend|girlfriend|crush\s+on\s+(you|u))\M'
       OR msg ~* '\mbe\s+my\s+(girl|boy|babe|baby|wife|husband|lover)\w*\M'
       OR msg ~* '\mi\s+love\s+(you|u)\M'
       OR msg ~* '\m(my\s+love|babe|baby\s+girl|baby\s+boy)\M')
    UNION ALL
    SELECT 'looks_or_body'
    WHERE length(msg) <= 500 AND (
          msg ~* '\m(you|u|you''?re|youre|ur)\s+(are\s+|r\s+)?(so\s+|very\s+|too\s+)?(beautiful|pretty|handsome|cute|hot|gorgeous|attractive)\M'
       OR msg ~* '\mwhat\s+(are|r)\s+(you|u)\s+wearing\M'
       OR msg ~* '\m(your|ur)\s+(legs?|lips|chest|figure|shape)\M')
    UNION ALL
    SELECT 'gift_offer'
    WHERE length(msg) <= 500 AND (
          msg ~* '\m(i''?ll|i\s+will|i\s+can|let\s+me)\s+(buy|get|send|give)\s+(you|u)\M'
       OR msg ~* '\m(a\s+)?gift\s+for\s+(you|u)\M')
    UNION ALL
    SELECT 'just_us'
    WHERE length(msg) <= 500 AND (
          msg ~* '\mprivate(ly)?\s+(chat|message|talk)\M'
       OR msg ~* '\m(just|only)\s+(us|you\s+and\s+me|between\s+us)\M'
       OR msg ~* '\mnobody\s+(has\s+to|needs\s+to|will)\s+know\M')
  ) hits;
$$;

-- Supabase auto-grants every new function to anon and authenticated; only the message trigger (running as the
-- table owner) calls these two, so close them to app users.
REVOKE ALL ON FUNCTION public.together_message_safety_categories(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.together_weak_signals(text) FROM PUBLIC, anon, authenticated;

-- ── 2. Automatic check on every student message ──────────────────────────
CREATE OR REPLACE FUNCTION public.together_messages_safety_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cats    text[];
  mine    text[];
  kinds   text[];
  context text;
BEGIN
  IF NEW.role <> 'user' OR coalesce(NEW.content, '') = '' THEN
    RETURN NULL;
  END IF;

  -- 1) This message on its own. Never let a problem here stop a message from being sent.
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

  -- 2) The same sender's recent messages in this room: warning signs that are harmless alone.
  BEGIN
    mine := together_weak_signals(NEW.content);
    IF cardinality(mine) > 0 AND NEW.sender_id IS NOT NULL THEN
      SELECT coalesce(array_agg(DISTINCT s), '{}') INTO kinds
        FROM (
          SELECT unnest(together_weak_signals(m.content)) AS s
          FROM (
            SELECT content
              FROM together_messages
             WHERE room_id = NEW.room_id AND sender_id = NEW.sender_id AND role = 'user'
               AND deleted_at IS NULL AND created_at > now() - interval '24 hours'
               AND length(content) <= 500
             ORDER BY created_at DESC
             LIMIT 6
          ) m
        ) x;

      IF cardinality(kinds) >= 3 AND NOT EXISTS (
        SELECT 1 FROM together_safety_flags f
         WHERE f.room_id = NEW.room_id AND f.sender_id = NEW.sender_id
           AND 'escalating_pattern' = ANY (f.categories)
           AND f.created_at > now() - interval '24 hours'
      ) THEN
        -- The excerpt is the recent messages themselves, oldest first, so a leader reads the whole exchange.
        SELECT string_agg(content, E'\n' ORDER BY created_at) INTO context
          FROM (
            SELECT content, created_at
              FROM together_messages
             WHERE room_id = NEW.room_id AND sender_id = NEW.sender_id AND role = 'user'
               AND deleted_at IS NULL AND created_at > now() - interval '24 hours'
               AND length(content) <= 500
             ORDER BY created_at DESC
             LIMIT 6
          ) recent;

        INSERT INTO together_safety_flags
          (organization_id, room_id, room_name, message_id, sender_id, sender_name, excerpt, source, categories)
        SELECT r.organization_id, r.id, r.name, NEW.id, NEW.sender_id, NEW.sender_name,
               left(context, 2000), 'auto', ARRAY['escalating_pattern']
        FROM together_rooms r WHERE r.id = NEW.room_id;
      END IF;
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'together recent-messages check failed for message %: %', NEW.id, SQLERRM;
  END;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.together_messages_safety_check() FROM PUBLIC, anon, authenticated;
