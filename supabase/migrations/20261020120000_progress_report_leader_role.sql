-- Maji Mazuri's leadership is shared by three people whose role is "leader". They may read their own
-- organization's monthly progress report, the same as site leaders, teachers and facilitators (Kevin, 19 Oct 2026).
-- Patches the existing function in place; the scope rules (own organization only, approved members only) are unchanged.
DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_functiondef('public.get_org_progress_report(date, uuid)'::regprocedure) INTO def;
  IF def LIKE '%''site_leader'', ''leader'',%' THEN RETURN; END IF;
  def := replace(def, '''site_leader'', ''teacher''', '''site_leader'', ''leader'', ''teacher''');
  IF def NOT LIKE '%''site_leader'', ''leader'',%' THEN RAISE EXCEPTION 'role list not found'; END IF;
  EXECUTE def;
END $$;
