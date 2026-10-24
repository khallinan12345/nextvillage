import { describe, it, expect } from 'vitest';
import { checkFile, hostsIn } from './rules.mjs';

const ids = (file, text, o) => checkFile(file, text, o).map((f) => f.rule);

describe('migrations', () => {
  const f = 'supabase/migrations/20261101000000_x.sql';

  it('flags a table with no RLS and no per-role revoke', () => {
    const r = ids(f, 'CREATE TABLE public.notes (id int);');
    expect(r).toContain('db-no-rls');
    expect(r).toContain('db-default-grants');
  });

  it('passes a table with RLS and per-role revokes', () => {
    const sql = `CREATE TABLE public.notes (id int);
      ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON public.notes FROM anon, authenticated;`;
    expect(ids(f, sql)).toEqual([]);
  });

  it('ignores SQL inside comments', () => {
    expect(ids(f, '-- CREATE TABLE public.nope (id int);')).toEqual([]);
  });

  it('flags a definer function with no search_path and no caller check', () => {
    const sql = `CREATE FUNCTION public.leak() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;`;
    const r = ids(f, sql);
    expect(r).toContain('db-definer-search-path');
    expect(r).toContain('db-definer-no-caller-check');
  });

  it('passes a definer function that pins search_path and uses auth.uid()', () => {
    const sql = `CREATE FUNCTION public.mine() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
      AS $$ SELECT 1 WHERE auth.uid() IS NOT NULL $$;
      REVOKE ALL ON FUNCTION public.mine() FROM anon, authenticated;`;
    expect(ids(f, sql)).toEqual([]);
  });

  it('accepts the quoted search_path form that pg_dump writes', () => {
    const sql = `CREATE OR REPLACE FUNCTION "public"."q"() RETURNS boolean LANGUAGE sql SECURITY DEFINER
      SET "search_path" = 'public' AS $$ SELECT auth.uid() IS NOT NULL $$;
      REVOKE ALL ON FUNCTION "public"."q"() FROM anon, authenticated;`;
    expect(ids(f, sql)).toEqual([]);
  });

  it('does not ask server-only definer functions to check the caller', () => {
    const sql = `CREATE FUNCTION public.purge() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT 1 $$;
      REVOKE ALL ON FUNCTION public.purge() FROM PUBLIC, anon, authenticated;`;
    expect(ids(f, sql)).toEqual([]);
  });

  it('still asks when a revoked definer function is granted back to signed-in users', () => {
    const sql = `CREATE FUNCTION public.open_fn() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT 1 $$;
      REVOKE ALL ON FUNCTION public.open_fn() FROM anon, authenticated;
      GRANT EXECUTE ON FUNCTION public.open_fn() TO authenticated;`;
    expect(ids(f, sql)).toContain('db-definer-no-caller-check');
  });

  it('honours an ignore comment', () => {
    const sql = `-- security-check: ignore db-no-rls -- lookup data, public by design
      CREATE TABLE public.t (id int); REVOKE ALL ON public.t FROM anon, authenticated;`;
    expect(ids(f, sql)).toEqual([]);
  });
});

describe('api routes', () => {
  it('flags a route with no auth', () => {
    expect(ids('api/open.js', 'export default async (req,res)=>res.json({}))')).toContain('api-no-auth');
  });
  it('accepts requireUser and CRON_SECRET', () => {
    expect(ids('api/a.js', "import {requireUser} from './_lib/requireUser.js'; requireUser(req,res)")).toEqual([]);
    expect(ids('api/b.ts', 'if (auth !== `Bearer ${process.env.CRON_SECRET}`) return')).toEqual([]);
  });
  it('flags a user id trusted from the body', () => {
    const r = ids('api/c.js', 'const { user_id } = req.body;');
    expect(r).toContain('api-trusts-body-id');
  });
  it('lets a secret-gated cron route choose the user', () => {
    expect(ids('api/cron.js', 'if (h !== process.env.CRON_SECRET) return; const { user_id } = req.body;')).toEqual([]);
  });
  it('is fine with a body id when the signed-in user is also resolved', () => {
    expect(ids('api/d.js', 'const u = await requireUser(req,res); const { user_id } = req.body;')).toEqual([]);
  });
  it('flags request content in logs', () => {
    expect(ids('api/e.js', 'requireUser(); console.log("got", req.body)')).toContain('log-student-content');
  });
  it('skips helpers and tests', () => {
    expect(ids('api/_lib/x.js', 'nothing')).toEqual([]);
    expect(ids('api/x.test.js', 'nothing')).toEqual([]);
  });
});

describe('claude temperature', () => {
  it('flags temperature on a Claude call', () => {
    expect(ids('api/f.js', "requireUser(); fetch('https://api.anthropic.com/v1/messages', { body: { model:'claude-sonnet-5-5', temperature: 0.3 } })")).toContain('ai-temperature-claude');
  });
  it('ignores temperature sent to our own proxy from the browser', () => {
    expect(ids('api/p.js', "requireUser(); fetch('/api/chat', { body: { model: 'claude-haiku-5-5', temperature: 0.3 } })")).toEqual([]);
  });
  it('accepts the gated pattern', () => {
    expect(ids('api/g.js', "requireUser(); fetch('https://api.anthropic.com/v1/messages'); ...(modelAllowsCustomTemperature(m) ? { temperature } : {})")).toEqual([]);
  });
});

describe('browser code', () => {
  it('flags a service-role key in src', () => {
    expect(ids('src/lib/x.ts', 'const k = import.meta.env.VITE_SERVICE_ROLE_KEY')).toContain('secret-in-browser');
  });
  it('passes ordinary browser code', () => {
    expect(ids('src/lib/y.ts', 'const k = import.meta.env.VITE_SUPABASE_ANON_KEY')).toEqual([]);
  });
});

describe('new outside hosts', () => {
  it('flags a host not in the base branch', () => {
    const known = new Set(['api.anthropic.com']);
    expect(ids('api/h.js', "requireUser(); fetch('https://api.newvendor.io/v1')", { knownHosts: known })).toContain('new-external-host');
  });
  it('accepts a known host', () => {
    const known = new Set(['api.newvendor.io']);
    expect(ids('api/h.js', "requireUser(); fetch('https://api.newvendor.io/v1')", { knownHosts: known })).toEqual([]);
  });
  it('ignores docs links', () => {
    expect([...hostsIn('see https://github.com/x and https://api.foo.dev')]).toEqual(['api.foo.dev']);
  });
});

describe('code execution outside the sandbox', () => {
  it('flags eval, new Function, child_process and vm in server code', () => {
    for (const code of ['eval(x)', 'new Function("return 1")', "const { exec } = require('child_process')", "import vm from 'node:vm'", 'vm.runInNewContext(code)'])
      expect(ids('api/run.js', `requireUser(); ${code}`)).toContain('code-exec-outside-sandbox');
  });
  it('flags it in the local server file too', () => {
    expect(ids('real-e2b-server.cjs', 'vm.runInNewContext(code)')).toContain('code-exec-outside-sandbox');
  });
  it('ignores mentions in comments and tests', () => {
    expect(ids('api/ok.js', 'requireUser();\n// there is deliberately no eval( fallback or vm.run here')).toEqual([]);
    expect(ids('api/ok.test.js', 'eval(x)')).toEqual([]);
  });
});

describe('iframes', () => {
  const tsx = (tag) => ids('src/pages/X.tsx', tag);
  it('flags a srcDoc iframe with no sandbox', () => {
    expect(tsx('<iframe srcDoc={html} />')).toContain('iframe-no-sandbox');
  });
  it('flags a dynamic src with no sandbox', () => {
    expect(tsx('<iframe src={`/api/site-page?x=${id}`} />')).toContain('iframe-no-sandbox');
  });
  it('flags allow-scripts together with allow-same-origin', () => {
    expect(tsx('<iframe srcDoc={h} sandbox="allow-scripts allow-same-origin" />')).toContain('iframe-no-sandbox');
  });
  it('accepts sandbox="allow-scripts" and fixed video embeds', () => {
    expect(tsx('<iframe srcDoc={h} sandbox="allow-scripts" />')).toEqual([]);
    expect(tsx('<iframe src="https://www.youtube.com/embed/abc" />')).toEqual([]);
  });
});

describe('personal data columns and chat tables', () => {
  const f = 'supabase/migrations/20261101000000_x.sql';
  const safe = 'ALTER TABLE public.t ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.t FROM anon, authenticated;';
  it('reminds about a new personal-data column', () => {
    expect(ids(f, `CREATE TABLE public.t (id int, guardian_email text); ${safe}`)).toContain('pii-column-datamap');
    expect(ids(f, `ALTER TABLE public.t ADD COLUMN IF NOT EXISTS birth_year integer; ${safe}`)).toContain('pii-column-datamap');
  });
  it('does not fire on timestamps, variables or function bodies', () => {
    expect(ids(f, `CREATE TABLE public.t (id int, emailed_at timestamptz); ${safe}`)).not.toContain('pii-column-datamap');
    const fn = `CREATE FUNCTION public.f() RETURNS void LANGUAGE plpgsql SET search_path = public AS $$ DECLARE email text; BEGIN END $$;`;
    expect(ids(f, fn)).not.toContain('pii-column-datamap');
  });
  it('prompts for a safety check on a new message table', () => {
    expect(ids(f, `CREATE TABLE public.room_messages (id int); ${safe}`)).toContain('chat-table-no-safety');
  });
  it('is satisfied when the migration has a safety trigger', () => {
    const sql = `CREATE TABLE public.room_messages (id int); ${safe} CREATE TRIGGER room_messages_safety AFTER INSERT ON public.room_messages FOR EACH ROW EXECUTE FUNCTION f();`;
    expect(ids(f, sql)).not.toContain('chat-table-no-safety');
  });
});

describe('public working documents', () => {
  it('flags row counts in a working document', () => {
    expect(ids('docs/privacy-and-legal/DATA-MAP.md', '| profiles (~325 rows) |')).toContain('public-sensitive-doc');
  });
  it('allows documents meant for families', () => {
    expect(ids('docs/privacy-and-legal/LEARNER-PRIVACY.md', 'about 325 rows')).toEqual([]);
  });
});
