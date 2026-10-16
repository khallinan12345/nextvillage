-- Public winner stories: remove a minor's own name from the story text (privacy review A4,
-- docs/AI-LEGAL-REVIEW.md). Under-13s were already renamed to "Learner NNNN" everywhere; this extends the
-- text clean-up to every learner who is or may be under 18, replacing their name parts with "this learner".
-- (The landing page also shows initials only; see src/lib/displayName.ts.)

-- Replace every part of a person's name with one replacement, and collapse repeats so a three-part name
-- becomes a single "this learner" rather than three in a row.
CREATE OR REPLACE FUNCTION public.mask_person_in_text(p_text text, p_full_name text, p_replacement text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT regexp_replace(
           public.replace_person_name(p_text, p_full_name, p_replacement),
           '(' || p_replacement || ')(\s+' || p_replacement || ')+', '\1', 'g');
$$;
REVOKE ALL ON FUNCTION public.mask_person_in_text(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mask_person_in_text(text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mask_young_champion_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  nm text;
BEGIN
  IF TG_TABLE_NAME = 'weekly_champions' THEN
    IF public.is_young_learner(NEW.champion_user_id) THEN
      SELECT name INTO nm FROM profiles WHERE id = NEW.champion_user_id;
      NEW.champion_story := public.mask_person_in_text(NEW.champion_story, nm, public.learner_pseudonym(NEW.champion_user_id));
      NEW.champion_name  := public.learner_pseudonym(NEW.champion_user_id);
    ELSIF public.is_minor_learner(NEW.champion_user_id) THEN
      SELECT name INTO nm FROM profiles WHERE id = NEW.champion_user_id;
      NEW.champion_story := public.mask_person_in_text(NEW.champion_story, nm, 'this learner');
    END IF;
  ELSIF TG_TABLE_NAME = 'community_challenges' THEN
    IF NEW.winner_id IS NOT NULL AND public.is_young_learner(NEW.winner_id) THEN
      SELECT name INTO nm FROM profiles WHERE id = NEW.winner_id;
      NEW.winner_reason := public.mask_person_in_text(NEW.winner_reason, nm, public.learner_pseudonym(NEW.winner_id));
      NEW.winner_name   := public.learner_pseudonym(NEW.winner_id);
    ELSIF NEW.winner_id IS NOT NULL AND public.is_minor_learner(NEW.winner_id) THEN
      SELECT name INTO nm FROM profiles WHERE id = NEW.winner_id;
      NEW.winner_reason := public.mask_person_in_text(NEW.winner_reason, nm, 'this learner');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.mask_young_champion_name() FROM PUBLIC, anon, authenticated;
