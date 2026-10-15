-- Weekly-champion stories and challenge-winner reasons are shown publicly (landing page). For
-- young learners the stored NAME was already replaced by "Learner NNNN"; this also replaces the
-- learner's own name where it appears inside the story or reason text.

CREATE OR REPLACE FUNCTION public.replace_person_name(p_text text, p_full_name text, p_replacement text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  tok text;
  out text := p_text;
BEGIN
  IF out IS NULL OR p_full_name IS NULL THEN RETURN out; END IF;
  FOREACH tok IN ARRAY regexp_split_to_array(trim(p_full_name), '\s+') LOOP
    IF char_length(tok) >= 3 THEN
      out := regexp_replace(out, '\m' || regexp_replace(tok, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M', p_replacement, 'gi');
    END IF;
  END LOOP;
  RETURN out;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_person_name(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_person_name(text, text, text) TO authenticated, service_role;

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
      NEW.champion_story := public.replace_person_name(NEW.champion_story, nm, public.learner_pseudonym(NEW.champion_user_id));
      NEW.champion_name  := public.learner_pseudonym(NEW.champion_user_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'community_challenges' THEN
    IF NEW.winner_id IS NOT NULL AND public.is_young_learner(NEW.winner_id) THEN
      SELECT name INTO nm FROM profiles WHERE id = NEW.winner_id;
      NEW.winner_reason := public.replace_person_name(NEW.winner_reason, nm, public.learner_pseudonym(NEW.winner_id));
      NEW.winner_name   := public.learner_pseudonym(NEW.winner_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.mask_young_champion_name() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS mask_young_champion_name ON public.weekly_champions;
CREATE TRIGGER mask_young_champion_name
  BEFORE INSERT OR UPDATE OF champion_name, champion_user_id, champion_story ON public.weekly_champions
  FOR EACH ROW EXECUTE FUNCTION public.mask_young_champion_name();

DROP TRIGGER IF EXISTS mask_young_champion_name ON public.community_challenges;
CREATE TRIGGER mask_young_champion_name
  BEFORE INSERT OR UPDATE OF winner_name, winner_id, winner_reason ON public.community_challenges
  FOR EACH ROW EXECUTE FUNCTION public.mask_young_champion_name();

-- Existing rows (a no-op update fires the trigger).
UPDATE public.weekly_champions SET champion_story = champion_story WHERE champion_user_id IS NOT NULL;
UPDATE public.community_challenges SET winner_reason = winner_reason WHERE winner_id IS NOT NULL;
