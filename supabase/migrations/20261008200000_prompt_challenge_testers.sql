-- Let specific accounts see the Prompt Challenge while the launch switch is off.
--
-- anchor_config.prompt_challenge_testers is a comma-separated list of account
-- ids. An account on the list is treated as enabled even when
-- prompt_challenge_enabled is 'false', so the whole flow can be tried by one
-- test learner without offering anything to real learners. An empty or missing
-- list changes nothing.
--
-- The function body is changed in place (one added step after the switch is
-- read) so everything else in my_checkpoint_status() stays exactly as it was.

INSERT INTO public.anchor_config (key, value) VALUES ('prompt_challenge_testers', '')
ON CONFLICT (key) DO NOTHING;

DO $patch$
DECLARE
  def text;
BEGIN
  SELECT pg_get_functiondef('public.my_checkpoint_status()'::regprocedure) INTO def;
  IF position('prompt_challenge_testers' IN def) = 0 THEN
    def := replace(
      def,
      '  enabled := COALESCE(enabled, false);',
$r$  enabled := COALESCE(enabled, false);
  IF NOT enabled THEN
    SELECT COALESCE(uid::text = ANY (string_to_array(replace(value, ' ', ''), ',')), false) INTO enabled
      FROM anchor_config WHERE key = 'prompt_challenge_testers';
    enabled := COALESCE(enabled, false);
  END IF;$r$
    );
    EXECUTE def;
  END IF;
END
$patch$;
