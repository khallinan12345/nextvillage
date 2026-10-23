-- Suggest Change: a feedback-and-follow-through process for platform changes, open to the whole staff panel
-- (see docs/platform-management/CHANGE-PROCESS.md). Separate from the leaders-only proposals in the Team
-- workspace. Nothing here holds learner data.
--
-- The panel = site leaders, leaders, teachers, facilitators, platform administrators, and each
-- organization's named child safety officer (matched by the email on the organization).
--
-- Stages (change_suggestions.status)
--   feedback        every panelist (except the proposer) is asked for feedback; ends when all have answered,
--                   or after the due date when the proposer / a manager closes it
--   revising        the proposer (or a manager) rewrites the proposal in light of the feedback
--   awaiting_owner  a site leader or platform administrator names who is responsible
--   in_progress     the owner makes the change
--   in_review       every panelist (except the owner) gives a thumbs up or feedback on what was built
--   closed          everyone has reviewed;  declined = a manager decided not to go ahead
--
-- All writes go through the functions below (tables are read-only to the app), so the rules live here.

CREATE OR REPLACE FUNCTION public.is_change_panelist(p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
     WHERE p.id = p_uid
       AND (p.role::text IN ('site_leader', 'leader', 'teacher', 'facilitator', 'platform_administrator')
            OR (p.email IS NOT NULL AND EXISTS (
                  SELECT 1 FROM organizations o
                   WHERE lower(btrim(o.child_safety_officer_email)) = lower(btrim(p.email))))));
$$;

CREATE OR REPLACE FUNCTION public.is_change_manager(p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM profiles p WHERE p.id = p_uid
                  AND p.role::text IN ('site_leader', 'platform_administrator'));
$$;

-- What the read policies use: asks only about the signed-in user, so it cannot be used to probe others.
CREATE OR REPLACE FUNCTION public.in_change_panel()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.is_change_panelist(auth.uid());
$$;

CREATE TABLE IF NOT EXISTS public.change_suggestions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title               text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  problem             text NOT NULL CHECK (char_length(btrim(problem)) >= 10),
  who_affected        text,
  evidence            text,
  proposed_change     text NOT NULL CHECK (char_length(btrim(proposed_change)) >= 10),
  cost_effort         text,
  success_measure     text,
  touches_children    boolean NOT NULL DEFAULT false,
  status              text NOT NULL DEFAULT 'feedback'
                      CHECK (status IN ('feedback', 'revising', 'awaiting_owner', 'in_progress', 'in_review', 'closed', 'declined')),
  feedback_due        timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  revised_change      text,
  revision_summary    text,
  owner_id            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_name          text,
  owner_note          text,
  assigned_by_name    text,
  implementation_note text,
  implemented_at      timestamptz,
  decline_reason      text,
  closed_at           timestamptz,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name     text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS change_suggestions_status_idx ON public.change_suggestions (status, created_at DESC);

-- One row per person asked for feedback; responded_at stays null until they answer.
CREATE TABLE IF NOT EXISTS public.change_feedback (
  suggestion_id uuid NOT NULL REFERENCES public.change_suggestions(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name     text,
  stance        text CHECK (stance IN ('support', 'support_with_changes', 'concern')),
  comment       text,
  responded_at  timestamptz,
  PRIMARY KEY (suggestion_id, user_id)
);

-- One row per person asked to review the finished change.
CREATE TABLE IF NOT EXISTS public.change_reviews (
  suggestion_id uuid NOT NULL REFERENCES public.change_suggestions(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name     text,
  approved      boolean,
  comment       text,
  reviewed_at   timestamptz,
  PRIMARY KEY (suggestion_id, user_id)
);

ALTER TABLE public.change_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_feedback    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_reviews     ENABLE ROW LEVEL SECURITY;

-- Supabase auto-grants every role on new tables; take it all back, then give read-only to signed-in users.
REVOKE ALL ON public.change_suggestions, public.change_feedback, public.change_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.change_suggestions, public.change_feedback, public.change_reviews TO authenticated;
GRANT ALL ON public.change_suggestions, public.change_feedback, public.change_reviews TO service_role;

CREATE POLICY cs_select ON public.change_suggestions FOR SELECT TO authenticated
  USING (public.in_change_panel());
-- Everyone on the panel can read answers that have been given; a person can always see their own request row.
CREATE POLICY cf_select ON public.change_feedback FOR SELECT TO authenticated
  USING (public.in_change_panel() AND (responded_at IS NOT NULL OR user_id = auth.uid()));
CREATE POLICY cr_select ON public.change_reviews FOR SELECT TO authenticated
  USING (public.in_change_panel() AND (reviewed_at IS NOT NULL OR user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_change_suggestion() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER trg_touch_change_suggestion BEFORE UPDATE ON public.change_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.touch_change_suggestion();

-- ── helpers (not callable by the app) ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.change_name(p_uid uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(nullif(btrim(name), ''), nullif(btrim(email), ''), 'Someone') FROM profiles WHERE id = p_uid;
$$;

CREATE OR REPLACE FUNCTION public.change_load(p_id uuid) RETURNS public.change_suggestions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s change_suggestions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_change_panelist(auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  SELECT * INTO s FROM change_suggestions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Change suggestion not found'; END IF;
  RETURN s;
END $$;

-- ── 1. Suggest ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.change_suggest(
  p_title text, p_problem text, p_who_affected text, p_evidence text, p_proposed_change text,
  p_cost_effort text, p_success_measure text, p_touches_children boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := auth.uid();
  new_id uuid;
  asked integer;
BEGIN
  IF me IS NULL OR NOT public.is_change_panelist(me) THEN RAISE EXCEPTION 'Not allowed'; END IF;

  INSERT INTO change_suggestions (title, problem, who_affected, evidence, proposed_change, cost_effort,
                                  success_measure, touches_children, created_by, created_by_name)
  VALUES (btrim(p_title), btrim(p_problem), nullif(btrim(p_who_affected), ''), nullif(btrim(p_evidence), ''),
          btrim(p_proposed_change), nullif(btrim(p_cost_effort), ''), nullif(btrim(p_success_measure), ''),
          coalesce(p_touches_children, false), me, public.change_name(me))
  RETURNING id INTO new_id;

  INSERT INTO change_feedback (suggestion_id, user_id, user_name)
  SELECT new_id, p.id, public.change_name(p.id)
    FROM profiles p
   WHERE p.id <> me AND public.is_change_panelist(p.id);
  GET DIAGNOSTICS asked = ROW_COUNT;

  -- Nobody else to ask: go straight to revising.
  IF asked = 0 THEN UPDATE change_suggestions SET status = 'revising' WHERE id = new_id; END IF;
  RETURN new_id;
END $$;

-- ── 2. Feedback ───────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.change_give_feedback(p_id uuid, p_stance text, p_comment text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s change_suggestions%ROWTYPE;
  waiting integer;
BEGIN
  s := public.change_load(p_id);
  IF s.status <> 'feedback' THEN RAISE EXCEPTION 'This suggestion is no longer collecting feedback'; END IF;
  IF p_stance NOT IN ('support', 'support_with_changes', 'concern') THEN RAISE EXCEPTION 'Choose how you feel about it'; END IF;
  IF p_stance <> 'support' AND char_length(btrim(coalesce(p_comment, ''))) < 3 THEN
    RAISE EXCEPTION 'Please say what you would change or what worries you';
  END IF;

  UPDATE change_feedback
     SET stance = p_stance, comment = nullif(btrim(p_comment), ''), responded_at = now()
   WHERE suggestion_id = p_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'You were not asked for feedback on this one'; END IF;

  SELECT count(*) INTO waiting FROM change_feedback WHERE suggestion_id = p_id AND responded_at IS NULL;
  IF waiting = 0 THEN UPDATE change_suggestions SET status = 'revising' WHERE id = p_id; RETURN 'revising'; END IF;
  RETURN 'feedback';
END $$;

-- After the due date (or any time for a platform administrator), the proposer or a manager can move on
-- without waiting for the last few answers.
CREATE OR REPLACE FUNCTION public.change_close_feedback(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s change_suggestions%ROWTYPE;
  is_admin boolean;
BEGIN
  s := public.change_load(p_id);
  IF s.status <> 'feedback' THEN RAISE EXCEPTION 'Feedback is already closed'; END IF;
  IF NOT (s.created_by = auth.uid() OR public.is_change_manager(auth.uid())) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role::text = 'platform_administrator') INTO is_admin;
  IF now() < s.feedback_due AND NOT is_admin THEN
    RAISE EXCEPTION 'Feedback stays open until %', to_char(s.feedback_due, 'YYYY-MM-DD');
  END IF;
  UPDATE change_suggestions SET status = 'revising' WHERE id = p_id;
END $$;

-- ── 3. Revise ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.change_publish_revision(p_id uuid, p_revised text, p_summary text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s change_suggestions%ROWTYPE;
BEGIN
  s := public.change_load(p_id);
  IF s.status <> 'revising' THEN RAISE EXCEPTION 'This suggestion is not waiting for a revision'; END IF;
  IF NOT (s.created_by = auth.uid() OR public.is_change_manager(auth.uid())) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF char_length(btrim(coalesce(p_revised, ''))) < 10 THEN RAISE EXCEPTION 'Write the updated proposal'; END IF;
  UPDATE change_suggestions
     SET revised_change = btrim(p_revised), revision_summary = nullif(btrim(p_summary), ''), status = 'awaiting_owner'
   WHERE id = p_id;
END $$;

-- ── 4. Owner ──────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.change_assign_owner(p_id uuid, p_owner uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s change_suggestions%ROWTYPE;
BEGIN
  s := public.change_load(p_id);
  IF NOT public.is_change_manager(auth.uid()) THEN RAISE EXCEPTION 'Only a site leader or platform administrator can name who is responsible'; END IF;
  IF s.status NOT IN ('awaiting_owner', 'in_progress') THEN RAISE EXCEPTION 'An owner can be named once the proposal is updated'; END IF;
  IF NOT public.is_change_panelist(p_owner) THEN RAISE EXCEPTION 'The owner must be a member of the review panel'; END IF;
  UPDATE change_suggestions
     SET owner_id = p_owner, owner_name = public.change_name(p_owner), owner_note = nullif(btrim(p_note), ''),
         assigned_by_name = public.change_name(auth.uid()), status = 'in_progress'
   WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION public.change_decline(p_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s change_suggestions%ROWTYPE;
BEGIN
  s := public.change_load(p_id);
  IF NOT public.is_change_manager(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF s.status NOT IN ('revising', 'awaiting_owner') THEN RAISE EXCEPTION 'Too late to decline this one'; END IF;
  IF char_length(btrim(coalesce(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'Say why, so nobody wonders what happened'; END IF;
  UPDATE change_suggestions SET status = 'declined', decline_reason = btrim(p_reason), closed_at = now() WHERE id = p_id;
END $$;

-- ── 5. Implemented → review ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.change_mark_implemented(p_id uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s change_suggestions%ROWTYPE;
  asked integer;
BEGIN
  s := public.change_load(p_id);
  IF s.status <> 'in_progress' THEN RAISE EXCEPTION 'This change is not in progress'; END IF;
  IF NOT (s.owner_id = auth.uid() OR public.is_change_manager(auth.uid())) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF char_length(btrim(coalesce(p_note, ''))) < 3 THEN RAISE EXCEPTION 'Say what was done so reviewers know what to look at'; END IF;

  DELETE FROM change_reviews WHERE suggestion_id = p_id;
  INSERT INTO change_reviews (suggestion_id, user_id, user_name)
  SELECT p_id, p.id, public.change_name(p.id)
    FROM profiles p
   WHERE p.id IS DISTINCT FROM s.owner_id AND public.is_change_panelist(p.id);
  GET DIAGNOSTICS asked = ROW_COUNT;

  UPDATE change_suggestions
     SET implementation_note = btrim(p_note), implemented_at = now(),
         status = CASE WHEN asked = 0 THEN 'closed' ELSE 'in_review' END,
         closed_at = CASE WHEN asked = 0 THEN now() END
   WHERE id = p_id;
END $$;

-- ── 6. Review ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.change_give_review(p_id uuid, p_approved boolean, p_comment text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s change_suggestions%ROWTYPE;
  waiting integer;
BEGIN
  s := public.change_load(p_id);
  IF s.status <> 'in_review' THEN RAISE EXCEPTION 'This change is not open for review'; END IF;
  IF p_approved IS NULL THEN RAISE EXCEPTION 'Give a thumbs up or write feedback'; END IF;
  IF NOT p_approved AND char_length(btrim(coalesce(p_comment, ''))) < 3 THEN
    RAISE EXCEPTION 'Please say what is wrong or missing';
  END IF;

  UPDATE change_reviews
     SET approved = p_approved, comment = nullif(btrim(p_comment), ''), reviewed_at = now()
   WHERE suggestion_id = p_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'You were not asked to review this one'; END IF;

  SELECT count(*) INTO waiting FROM change_reviews WHERE suggestion_id = p_id AND reviewed_at IS NULL;
  IF waiting = 0 THEN UPDATE change_suggestions SET status = 'closed', closed_at = now() WHERE id = p_id; RETURN 'closed'; END IF;
  RETURN 'in_review';
END $$;

-- A manager can send a change back to its owner when reviewers found problems.
CREATE OR REPLACE FUNCTION public.change_reopen(p_id uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s change_suggestions%ROWTYPE;
BEGIN
  s := public.change_load(p_id);
  IF NOT public.is_change_manager(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF s.status NOT IN ('in_review', 'closed') OR s.owner_id IS NULL THEN RAISE EXCEPTION 'Nothing to reopen'; END IF;
  DELETE FROM change_reviews WHERE suggestion_id = p_id AND reviewed_at IS NULL;
  UPDATE change_suggestions
     SET status = 'in_progress', closed_at = NULL,
         owner_note = coalesce(nullif(btrim(p_note), ''), owner_note)
   WHERE id = p_id;
END $$;

-- People a manager can name as owner.
CREATE OR REPLACE FUNCTION public.change_owner_candidates()
RETURNS TABLE (id uuid, name text, role text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_change_manager(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN QUERY
    SELECT p.id, public.change_name(p.id), p.role::text
      FROM profiles p
     WHERE public.is_change_panelist(p.id)
     ORDER BY 2;
END $$;

-- ── permissions: only the app-facing functions are callable, and only when signed in ──────────
REVOKE ALL ON FUNCTION public.is_change_panelist(uuid), public.is_change_manager(uuid), public.change_name(uuid),
  public.change_load(uuid), public.touch_change_suggestion() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  public.change_suggest(text, text, text, text, text, text, text, boolean),
  public.change_give_feedback(uuid, text, text),
  public.change_close_feedback(uuid),
  public.change_publish_revision(uuid, text, text),
  public.change_assign_owner(uuid, uuid, text),
  public.change_decline(uuid, text),
  public.change_mark_implemented(uuid, text),
  public.change_give_review(uuid, boolean, text),
  public.change_reopen(uuid, text),
  public.change_owner_candidates()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.change_suggest(text, text, text, text, text, text, text, boolean),
  public.change_give_feedback(uuid, text, text),
  public.change_close_feedback(uuid),
  public.change_publish_revision(uuid, text, text),
  public.change_assign_owner(uuid, uuid, text),
  public.change_decline(uuid, text),
  public.change_mark_implemented(uuid, text),
  public.change_give_review(uuid, boolean, text),
  public.change_reopen(uuid, text),
  public.change_owner_candidates()
TO authenticated;

REVOKE ALL ON FUNCTION public.in_change_panel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.in_change_panel() TO authenticated;
