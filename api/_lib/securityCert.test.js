import { describe, it, expect } from 'vitest';
import {
  CRITERIA, CRITERION_NAMES, bandFor, cleanFiles, scoreFiles, isPassing, averageScore, MAX_FILE_CHARS,
} from './securityCert.js';
import { CERT_REPO, CERT_CRITERIA } from '../../src/pages/tech-skills/securityCert/certRepo';

const starter = () => Object.fromEntries(CERT_REPO.map((f) => [f.path, f.content]));

// One reference fix for the whole repo, written independently of the checks.
const L = (...lines) => lines.join('\n');
const SOLUTION = {
  'package.json': L('{', '  "dependencies": {', '    "react": "^18.2.0",', '    "react-router-dom": "^6.21.0",', '    "@supabase/supabase-js": "^2.39.0"', '  }', '}', ''),
  'src/lib/settings.js': L("export const API_URL = 'https://riverside.example.com/api'", ''),
  'src/lib/supabase.js': L(
    "import { createClient } from '@supabase/supabase-js'",
    'export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)',
    '',
  ),
  '.env': L('VITE_SUPABASE_URL=https://riv1234.supabase.co', 'SMS_SECRET=your-key-here', ''),
  '.env.example': L('VITE_SUPABASE_URL=your-url-here', 'VITE_SUPABASE_ANON_KEY=your-anon-key-here', ''),
  '.gitignore': L('node_modules', 'dist', '.env', ''),
  'src/lib/accounts.js': L(
    "import { supabase } from './supabase.js'",
    'export async function register(email, password) {',
    "  if (password.length < 10) throw new Error('Too short')",
    '  return supabase.auth.signUp({ email, password })',
    '}',
    'export async function login(email, password) {',
    '  return supabase.auth.signInWithPassword({ email, password })',
    '}',
    '',
  ),
  'src/components/Notes.jsx': L(
    "import { supabase } from '../lib/supabase.js'",
    'export function NoteList({ notes }) {',
    '  return <ul>{notes.map(n => <li key={n.id}><h3>{n.title}</h3><p>{n.body}</p></li>)}</ul>',
    '}',
    'export async function findPatient(name) {',
    "  const { data } = await supabase.from('patients').select('*').eq('name', name)",
    '  return data',
    '}',
    '',
  ),
  'supabase/schema.sql': L(
    'create table clinics (id uuid primary key, name text);',
    'create table patients (id uuid primary key, user_id uuid, name text);',
    'create table appointments (id uuid primary key, user_id uuid, slot timestamptz);',
    'alter table clinics enable row level security;',
    'alter table public.patients enable row level security;',
    'alter table appointments enable row level security;',
    'create policy "read clinics" on clinics for select using (true);',
    'create policy "own patients" on patients for all using (user_id = auth.uid());',
    'create policy "own appointments" on appointments for all using (auth.uid() = user_id);',
    '',
  ),
  '.github/workflows/deploy.yml': L(
    'name: Deploy', 'on: [push]', 'permissions:', '  contents: read', 'jobs:', '  deploy:', '    runs-on: ubuntu-latest', '    steps:',
    '      - uses: actions/checkout@v4', '      - run: npm ci && npm run build', '',
  ),
  '.github/dependabot.yml': L('version: 2', 'updates:', '  - package-ecosystem: npm', '    directory: /', '    schedule:', '      interval: daily', ''),
  '.github/CODEOWNERS': L('* @clinic-lead', '/.github/ @clinic-lead', ''),
  'ai-prompt-log.md': L('# AI prompt log', '', '> Reminders are not sending and a patient says she never got her appointment text. Can you fix the appointment reminders?', ''),
  'SECURITY.md': L('# Security', 'Report problems to security@riverside.example.', 'Please do not post them in public issues.', 'We reply within 2 days.', ''),
};

describe('security certification grading', () => {
  it('scores zero on every file-checked criterion for the repo exactly as shipped (doing nothing earns nothing)', () => {
    for (const s of scoreFiles(starter())) expect(s.met, s.assessment_name).toBe(0);
  });

  it('scores full marks on every file-checked criterion for the reference fix', () => {
    const scores = scoreFiles({ ...starter(), ...SOLUTION });
    for (const s of scores) expect(s.score, `${s.assessment_name} (${s.met}/${s.total})`).toBe(3);
  });

  it('gives partial credit for partial fixes, and never reveals which requirement was missed', () => {
    const files = { ...starter(), '.gitignore': SOLUTION['.gitignore'], 'src/lib/settings.js': SOLUTION['src/lib/settings.js'] };
    const secrets = scoreFiles(files).find((s) => s.key === 'secrets');
    expect(secrets.met).toBeGreaterThan(0);
    expect(secrets.met).toBeLessThan(secrets.total);
    expect(secrets.evidence).toBe(`${secrets.met} of ${secrets.total} requirements met.`);
  });

  it('does not accept blanking a file, or an open policy, as a fix', () => {
    const blanked = scoreFiles({ ...starter(), 'src/components/Notes.jsx': '', 'src/lib/accounts.js': '', 'src/lib/supabase.js': '' });
    for (const k of ['input', 'auth']) expect(blanked.find((s) => s.key === k).met, k).toBe(0);

    const openPolicies = L(SOLUTION['supabase/schema.sql'].split('\n').filter((l) => !/own /.test(l)).join('\n'),
      'create policy "o" on patients for all using (true);', 'create policy "o2" on appointments for all using (true);');
    const db = scoreFiles({ ...starter(), 'supabase/schema.sql': openPolicies }).find((s) => s.key === 'database');
    expect(db.met).toBe(4); // three RLS switches + the clinics read policy, but neither owner policy
  });

  it('requires a real minimum password length, not a token one', () => {
    const accounts = (rule) => ({ ...starter(), ...SOLUTION, 'src/lib/accounts.js': SOLUTION['src/lib/accounts.js'].replace('password.length < 10', rule) });
    const auth = (rule) => scoreFiles(accounts(rule)).find((s) => s.key === 'auth');
    expect(auth('password.length < 8').score).toBe(3);
    expect(auth('password.length < 3').score).toBeLessThan(3);
  });

  it('maps requirement counts to the 0-3 scale', () => {
    expect([bandFor(0, 6), bandFor(1, 6), bandFor(3, 6), bandFor(4, 6), bandFor(5, 6), bandFor(6, 6)]).toEqual([0, 1, 1, 2, 2, 3]);
    expect(bandFor(0, 0)).toBe(0);
  });

  it('passes only when every criterion is Proficient or better', () => {
    expect(isPassing([{ score: 2 }, { score: 3 }])).toBe(true);
    expect(isPassing([{ score: 2 }, { score: 1 }])).toBe(false);
    expect(isPassing([])).toBe(false);
    expect(averageScore([{ score: 3 }, { score: 1 }])).toBe(2);
  });

  it('keeps only well-formed files and clamps their size', () => {
    const out = cleanFiles([
      { path: 'a.js', content: 'x'.repeat(MAX_FILE_CHARS + 50) },
      { path: 5, content: 'bad' }, { content: 'no path' }, null, 'junk',
    ]);
    expect(Object.keys(out)).toEqual(['a.js']);
    expect(out['a.js'].length).toBe(MAX_FILE_CHARS);
    expect(cleanFiles('nope')).toEqual({});
  });

  it('shows the learner the same criterion names the server grades, plus the written review', () => {
    expect(CERT_CRITERIA.map((c) => c.name)).toEqual(CRITERION_NAMES);
    expect(CRITERIA.length + 1).toBe(CRITERION_NAMES.length);
  });

  it('only ever checks files that exist in the shipped repo', () => {
    const paths = new Set(CERT_REPO.map((f) => f.path));
    // A check that reads a path the repo does not have could never pass; catch typos in either file.
    const probed = new Set();
    const spy = new Proxy({}, { get: (_t, p) => { probed.add(String(p)); return ''; } });
    for (const c of CRITERIA) for (const t of c.checks) { try { t(spy); } catch { /* checks may choke on empty text */ } }
    for (const p of probed) expect(paths.has(p), p).toBe(true);
  });
});
