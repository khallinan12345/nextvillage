// src/pages/tech-skills/securityLab/content.ts
//
// Content for the Security & Safety Lab (/tech-skills/security-safety).
//
// The learner gets a small practice repo ("Village Market") with security mistakes planted in it.
// Each task walks them through a few steps, one at a time:
//   decide    — pick the right answer(s) and see why each choice is right or wrong
//   fix       — edit a file in the editor; automatic checks tell them what is still wrong
//   checklist — tick off protections (GitHub settings) after doing or understanding them
//   explain   — say it in their own words; the AI coach reviews it
//
// Every fix step carries a reference `solution`. content.test.ts proves that each check FAILS on the
// starter files and PASSES once the solution is applied, so the checks cannot silently rot.

export interface ProjectFile { path: string; content: string; }
export type FileMap = Record<string, string>;
export type Phase = 1 | 2 | 3;

export interface Check {
  id: string;
  label: string;
  test: (files: FileMap) => boolean;
  /** Shown one at a time as the learner keeps missing; the last one is nearly the answer. */
  hints: string[];
}

export interface Option { id: string; label: string; feedback: string; }

export type Step =
  | {
      kind: 'decide'; id: string; teaching: string; question: string;
      multi?: boolean; options: Option[]; correct: string[];
    }
  | {
      kind: 'fix'; id: string; teaching: string; instruction: string; openFile: string;
      checks: Check[]; solution: ProjectFile[]; solutionNote: string;
    }
  | {
      kind: 'checklist'; id: string; teaching: string; instruction: string;
      items: { id: string; label: string; where: string; stops: string }[];
    }
  | {
      kind: 'explain'; id: string; teaching: string; question: string;
      /** Used only if the AI coach is unreachable: at least `need` groups must each have a word present. */
      keywords: { groups: string[][]; need: number };
      modelAnswer: string;
    };

export interface TaskDef {
  id: string; label: string; phase: Phase; icon: string; isOnboarding?: boolean; steps: Step[];
}

const L = (...lines: string[]) => lines.join('\n');

// ─── Practice repo ───────────────────────────────────────────────────────────

export const STARTER_FILES: ProjectFile[] = [
  {
    path: 'README.md',
    content: L(
      '# Village Market',
      '',
      'A small site where villagers list produce and place orders.',
      'This is a practice repo: it has security mistakes planted in it on purpose.',
      'Your job is to find them and fix them, one step at a time.',
      '',
    ),
  },
  {
    path: 'package.json',
    content: L(
      '{',
      '  "name": "village-market",',
      '  "private": true,',
      '  "version": "0.1.0",',
      '  "type": "module",',
      '  "scripts": { "dev": "vite", "build": "vite build" },',
      '  "dependencies": {',
      '    "react": "^18.2.0",',
      '    "react-dom": "^18.2.0",',
      '    "react-routr-dom": "^6.21.0",',
      '    "@supabase/supabase-js": "^2.39.0"',
      '  },',
      '  "devDependencies": { "vite": "^5.0.8", "@vitejs/plugin-react": "^4.2.1" }',
      '}',
      '',
    ),
  },
  {
    path: 'src/config.js',
    content: L(
      '// Village Market settings',
      "export const SUPABASE_URL = 'https://abcd1234.supabase.co'",
      "export const SUPABASE_ANON_KEY = 'public-anon-key-goes-here'",
      "export const PAYMENT_SECRET_KEY = 'pay_secret_VILLAGE51Hx9aBcD3fGh1jKlM'",
      "export const ADMIN_PASSWORD = 'market2024!'",
      '',
    ),
  },
  {
    path: '.env',
    content: L(
      'VITE_SUPABASE_URL=https://abcd1234.supabase.co',
      'PAYMENT_SECRET_KEY=pay_secret_VILLAGE51Hx9aBcD3fGh1jKlM',
      '',
    ),
  },
  { path: '.env.example', content: L('# TODO: list the variable NAMES this project needs (never real values)', '') },
  { path: '.gitignore', content: L('node_modules', 'dist', '') },
  {
    path: 'src/auth.js',
    content: L(
      "import { supabase } from './lib/supabase.js'",
      '',
      '// Our own login system, built from scratch',
      'export async function signUp(email, password) {',
      "  return supabase.from('users').insert({ email, password })",
      '}',
      '',
      'export async function logIn(email, password) {',
      '  const { data } = await supabase',
      "    .from('users')",
      '    .select(\'*\')',
      "    .eq('email', email)",
      "    .eq('password', password)",
      '    .single()',
      '  return data',
      '}',
      '',
    ),
  },
  {
    path: 'src/components/Comments.jsx',
    content: L(
      "import { supabase } from '../lib/supabase.js'",
      '',
      'export function CommentList({ comments }) {',
      '  return (',
      '    <ul>',
      '      {comments.map(c => (',
      '        <li key={c.id}>',
      '          <strong>{c.author}</strong>',
      '          <div dangerouslySetInnerHTML={{ __html: c.body }} />',
      '        </li>',
      '      ))}',
      '    </ul>',
      '  )',
      '}',
      '',
      'export async function searchListings(term) {',
      "  // Build the query by gluing the visitor's search words into SQL",
      "  const { data } = await supabase.rpc('run_sql', {",
      "    q: \"select * from listings where name like '%\" + term + \"%'\",",
      '  })',
      '  return data',
      '}',
      '',
    ),
  },
  {
    path: 'supabase/schema.sql',
    content: L(
      'create table listings (',
      '  id uuid primary key default gen_random_uuid(),',
      '  name text not null,',
      '  price numeric not null,',
      '  seller_id uuid references auth.users(id)',
      ');',
      '',
      'create table orders (',
      '  id uuid primary key default gen_random_uuid(),',
      '  listing_id uuid references listings(id),',
      '  user_id uuid references auth.users(id),',
      '  phone text,',
      '  created_at timestamptz default now()',
      ');',
      '',
      '-- TODO: who is allowed to see these tables?',
      '',
    ),
  },
  { path: '.github/dependabot.yml', content: L('# TODO: ask GitHub to watch our dependencies', '') },
  {
    path: '.github/workflows/ci.yml',
    content: L(
      'name: CI',
      'on: [push, pull_request]',
      'permissions: write-all',
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@main',
      '      - uses: actions/setup-node@main',
      '        with:',
      '          node-version: 20',
      '      - run: npm ci',
      '      - run: npm run build',
      '',
    ),
  },
  { path: '.github/CODEOWNERS', content: L('# TODO: who must review changes to which files?', '') },
  {
    path: 'ai-notes.md',
    content: L(
      '# My AI chat log',
      '',
      'Prompt I sent today:',
      '',
      '> My checkout is failing. Here is my payment key pay_secret_VILLAGE51Hx9aBcD3fGh1jKlM and my',
      '> customer Amina Bello, phone 0800 123 4567, says her order disappeared. Can you fix my checkout?',
      '',
    ),
  },
  { path: 'SECURITY.md', content: L('# Security', '', '<!-- TODO: how should someone tell us about a problem? -->', '') },
];

export const toMap = (files: ProjectFile[]): FileMap =>
  Object.fromEntries(files.map(f => [f.path, f.content]));

const has = (f: FileMap, path: string) => f[path] ?? '';
const nonComment = (text: string) =>
  text.split('\n').filter(l => l.trim() && !l.trim().startsWith('#') && !l.trim().startsWith('--'));
const statements = (sql: string) => sql.split(';').map(s => s.trim()).filter(Boolean);

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const TASKS: TaskDef[] = [
  {
    id: 'welcome', label: 'Welcome to the Lab', phase: 1, icon: '🛡️', isOnboarding: true, steps: [],
  },

  // ── Phase 1: Spot ─────────────────────────────────────────────────────────
  {
    id: 'secrets', label: 'Keep Secrets Secret', phase: 1, icon: '🔑', steps: [
      {
        kind: 'decide', id: 'secrets-decide', multi: true,
        teaching:
          'A secret is anything that proves you are allowed to do something: a password, an API key, a token. ' +
          'Some keys are made to be public (your Supabase URL and anon key are protected by database rules). ' +
          'Others, like a payment secret key, can move real money the moment a stranger copies them.',
        question: 'Open src/config.js. Which TWO lines must never appear in code that runs in a browser?',
        options: [
          { id: 'url', label: 'SUPABASE_URL', feedback: 'This is only an address. It is public by design — anyone visiting your site can see it.' },
          { id: 'anon', label: 'SUPABASE_ANON_KEY', feedback: 'Public by design too. It only works within the rules (RLS) you set on the database, which you will do later. It still belongs in an environment variable, but it is not a secret.' },
          { id: 'pay', label: 'PAYMENT_SECRET_KEY', feedback: 'Right. A live secret key can charge cards and issue refunds. Anything in browser code can be read by every visitor.' },
          { id: 'admin', label: 'ADMIN_PASSWORD', feedback: 'Right. A password in browser code is not a password — anyone can open the page source and read it.' },
        ],
        correct: ['pay', 'admin'],
      },
      {
        kind: 'fix', id: 'secrets-config', openFile: 'src/config.js',
        teaching:
          'Browser code is public. Anything you put in it, every visitor can read. Public settings should come from ' +
          'environment variables (import.meta.env.VITE_…). Real secrets should not be in browser code at all — they ' +
          'belong on a server that only you control.',
        instruction: 'Fix src/config.js: read the public settings from import.meta.env, and remove the two secrets from this file.',
        checks: [
          {
            id: 'no-key', label: 'The payment secret key is gone from src/config.js',
            test: f => !/pay_secret_/i.test(has(f, 'src/config.js')),
            hints: [
              'Look for the line that starts with pay_secret_. That is a live payment key.',
              'Delete the whole PAYMENT_SECRET_KEY line. A server-side file will hold it instead.',
            ],
          },
          {
            id: 'no-pass', label: 'The admin password is gone from src/config.js',
            test: f => !/ADMIN_PASSWORD\s*=/.test(has(f, 'src/config.js')) && !/market2024/.test(has(f, 'src/config.js')),
            hints: [
              'A password written in the file is readable by everyone who loads the site.',
              'Delete the ADMIN_PASSWORD line. Admin checks should happen on the server.',
            ],
          },
          {
            id: 'env', label: 'The public settings now come from import.meta.env',
            test: f => /import\.meta\.env\.VITE_SUPABASE_URL/.test(has(f, 'src/config.js')) && /import\.meta\.env\.VITE_SUPABASE_ANON_KEY/.test(has(f, 'src/config.js')),
            hints: [
              'Replace the typed-in values with variables that are filled in when the site is built.',
              "Use: export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL (and the same idea for the anon key).",
            ],
          },
        ],
        solution: [{
          path: 'src/config.js',
          content: L(
            '// Village Market settings',
            'export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL',
            'export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY',
            '// The payment secret key and admin password do NOT belong in browser code.',
            '// They live on the server as environment variables.',
            '',
          ),
        }],
        solutionNote: 'Public settings come from environment variables; real secrets were removed from browser code entirely.',
      },
      {
        kind: 'fix', id: 'secrets-git', openFile: '.gitignore',
        teaching:
          'Environment variables usually live in a file called .env. If that file is committed to Git, your secrets are ' +
          'in the project forever. The fix has three parts: tell Git to ignore .env, keep real values out of it in the ' +
          'repo, and publish a .env.example that lists only the variable NAMES so teammates know what to set.',
        instruction: 'Fix three files: add .env to .gitignore, remove the live key from .env, and list the variable names in .env.example.',
        checks: [
          {
            id: 'ignore', label: '.gitignore lists .env',
            test: f => /^\s*\.env\s*$/m.test(has(f, '.gitignore')),
            hints: ['Open .gitignore. Each line is a file or folder Git should never save.', 'Add a new line that says exactly: .env'],
          },
          {
            id: 'env-clean', label: '.env no longer contains the live key',
            test: f => !/pay_secret_/i.test(has(f, '.env')),
            hints: [
              'Open .env and look for the pay_secret_ value.',
              'Replace the real value with a placeholder like your-key-here. (Remember: removing it here does not erase it from Git history — you will see why next.)',
            ],
          },
          {
            id: 'example', label: '.env.example lists VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY with no real values',
            test: f => /VITE_SUPABASE_URL=/.test(has(f, '.env.example')) && /VITE_SUPABASE_ANON_KEY=/.test(has(f, '.env.example')) && !/pay_secret_/i.test(has(f, '.env.example')),
            hints: ['The example file shows teammates which names to fill in.', 'Add two lines: VITE_SUPABASE_URL=your-url-here and VITE_SUPABASE_ANON_KEY=your-anon-key-here'],
          },
        ],
        solution: [
          { path: '.gitignore', content: L('node_modules', 'dist', '.env', '') },
          { path: '.env', content: L('VITE_SUPABASE_URL=https://abcd1234.supabase.co', 'PAYMENT_SECRET_KEY=your-key-here', '') },
          { path: '.env.example', content: L('VITE_SUPABASE_URL=your-url-here', 'VITE_SUPABASE_ANON_KEY=your-anon-key-here', '') },
        ],
        solutionNote: '.env is ignored, holds placeholders in the repo, and .env.example documents the names.',
      },
      {
        kind: 'explain', id: 'secrets-explain',
        teaching:
          'Git remembers every version of every file. Deleting a secret in a new commit hides it from today’s files, ' +
          'but anyone can still read it in the history. Bots scan public repos for exactly this, often within minutes.',
        question: 'In your own words: if a secret key was ever pushed to GitHub, why is deleting it from the file not enough? What must you do?',
        keywords: { groups: [['history', 'commit', 'still', 'forever', 'remember', 'copy', 'copied'], ['rotate', 'revoke', 'replace', 'new key', 'change the key', 'regenerate']], need: 2 },
        modelAnswer: 'Git keeps the old version in its history, and bots may already have copied it. The key must be rotated (revoked and replaced) so the old one stops working.',
      },
    ],
  },
  {
    id: 'github_secrets', label: 'GitHub: When a Secret Leaks', phase: 1, icon: '🚨', steps: [
      {
        kind: 'decide', id: 'gs-decide',
        teaching:
          'Responding to a leaked secret has an order. The first job is to make the leaked secret useless. ' +
          'Cleaning up the repository comes after, because you cannot be sure who already copied it.',
        question: 'You notice the live payment key was pushed to a public repo 3 days ago. What do you do FIRST?',
        options: [
          { id: 'delete', label: 'Delete the file and push again', feedback: 'Not first. The key is still in the commit history, and copies may already exist.' },
          { id: 'rotate', label: 'Revoke the key with the payment provider and create a new one', feedback: 'Correct. Once the old key stops working, the leak can no longer be used. Everything else is cleanup.' },
          { id: 'private', label: 'Make the repository private', feedback: 'Helpful later, but anyone who already cloned or scraped it still has the key.' },
          { id: 'wait', label: 'Wait and see if anything strange happens', feedback: 'Bots use leaked keys within minutes. Waiting is how small leaks become big bills.' },
        ],
        correct: ['rotate'],
      },
      {
        kind: 'checklist', id: 'gs-checklist',
        teaching:
          'GitHub can watch for leaked secrets for you. Secret scanning finds keys that were already pushed. ' +
          'Push protection goes further and blocks the push before the key ever lands. ' +
          'You can switch these on in your repository settings.',
        instruction: 'Tick each protection once you have switched it on in a repo of your own — or once you understand where it lives and what it stops. Nothing here changes your account.',
        items: [
          { id: 'scan', label: 'Secret scanning', where: 'Repo → Settings → Code security → Secret scanning', stops: 'Finds secrets that were already pushed and tells you to rotate them.' },
          { id: 'push', label: 'Push protection', where: 'Repo → Settings → Code security → Push protection', stops: 'Blocks a push that contains a recognised secret, before it reaches GitHub.' },
          { id: 'dep', label: 'Dependabot alerts', where: 'Repo → Settings → Code security → Dependabot alerts', stops: 'Warns you when a package you use has a known security problem.' },
          { id: '2fa', label: 'Two-factor authentication on your account', where: 'Your profile → Settings → Password and authentication', stops: 'Stops someone who guesses or steals your password from taking over your account.' },
        ],
      },
      {
        kind: 'explain', id: 'gs-explain',
        teaching: 'Scanning tells you about a leak after it happened. Push protection stops it happening. Prevention is almost always cheaper than cleanup.',
        question: 'Why is push protection better than only relying on secret scanning?',
        keywords: { groups: [['before', 'block', 'stop', 'prevent', 'blocks'], ['already', 'after', 'too late', 'leaked', 'copied']], need: 1 },
        modelAnswer: 'Push protection blocks the secret before it is pushed, so it never leaks. Secret scanning only finds it after it is already public, when it may have been copied.',
      },
    ],
  },

  // ── Phase 2: Protect ──────────────────────────────────────────────────────
  {
    id: 'auth', label: 'Passwords & Login', phase: 2, icon: '🔐', steps: [
      {
        kind: 'decide', id: 'auth-decide',
        teaching:
          'Look at src/auth.js. It saves each person’s password exactly as they typed it and later compares it. ' +
          'Safe systems never keep the real password. They keep a one-way scramble (a hash) that cannot be turned back.',
        question: 'The users table is private. Why is saving real passwords still dangerous?',
        options: [
          { id: 'slow', label: 'It makes the site slower', feedback: 'Speed is not the problem here.' },
          { id: 'leak', label: 'If the table is ever seen (a bug, a leak, a curious staff member), every password is exposed — and people reuse passwords on other sites', feedback: 'Correct. One slip exposes everyone, and the damage spreads to their other accounts.' },
          { id: 'fine', label: 'It is fine if the database is private', feedback: 'Private today, exposed after one mistake. Plan for the mistake.' },
          { id: 'space', label: 'It uses too much storage', feedback: 'Storage has nothing to do with it.' },
        ],
        correct: ['leak'],
      },
      {
        kind: 'fix', id: 'auth-fix', openFile: 'src/auth.js',
        teaching:
          'Writing your own login system is how most beginners accidentally ship a weak one. Supabase Auth already hashes ' +
          'passwords, handles sessions, and has been tested by experts. Your job is to use it correctly and to refuse very short passwords.',
        instruction: 'Rewrite src/auth.js to use Supabase Auth (supabase.auth.signUp and supabase.auth.signInWithPassword) and reject passwords shorter than 8 characters.',
        checks: [
          {
            id: 'no-users', label: 'No more saving or reading passwords in a `users` table',
            test: f => !/from\(\s*['"]users['"]\s*\)/.test(has(f, 'src/auth.js')),
            hints: ['Find the lines that talk to a table called users. That table holds the passwords.', 'Remove those lines. Supabase Auth keeps its own protected user records.'],
          },
          {
            id: 'signup', label: 'Sign-up uses supabase.auth.signUp',
            test: f => /supabase\.auth\.signUp\s*\(/.test(has(f, 'src/auth.js')),
            hints: ['The built-in function for creating an account lives under supabase.auth.', 'Call supabase.auth.signUp({ email, password }).'],
          },
          {
            id: 'login', label: 'Log-in uses supabase.auth.signInWithPassword',
            test: f => /supabase\.auth\.signInWithPassword\s*\(/.test(has(f, 'src/auth.js')),
            hints: ['There is a matching built-in for logging in.', 'Call supabase.auth.signInWithPassword({ email, password }).'],
          },
          {
            id: 'length', label: 'Passwords shorter than 8 characters are rejected',
            test: f => /password\.length\s*(<|<=|>=|>)\s*\d+/.test(has(f, 'src/auth.js')),
            hints: ['Check the length before calling signUp.', "Add: if (password.length < 8) throw new Error('Password must be at least 8 characters')"],
          },
        ],
        solution: [{
          path: 'src/auth.js',
          content: L(
            "import { supabase } from './lib/supabase.js'",
            '',
            'export async function signUp(email, password) {',
            "  if (password.length < 8) throw new Error('Password must be at least 8 characters')",
            '  return supabase.auth.signUp({ email, password })',
            '}',
            '',
            'export async function logIn(email, password) {',
            '  return supabase.auth.signInWithPassword({ email, password })',
            '}',
            '',
          ),
        }],
        solutionNote: 'Supabase Auth hashes and protects passwords; the app only enforces a minimum length.',
      },
      {
        kind: 'explain', id: 'auth-explain',
        teaching: 'A hash is a one-way scramble: easy to make, impossible to reverse. Login works by scrambling what you type and comparing the scrambles.',
        question: 'Why is it better to use a tested login system like Supabase Auth than to write your own?',
        keywords: { groups: [['hash', 'hashed', 'salt', 'scramble', 'encrypt'], ['expert', 'tested', 'mistake', 'secure', 'trusted', 'professional', 'safe']], need: 1 },
        modelAnswer: 'Experts already built and tested it. It hashes passwords and handles sessions correctly, while a home-made version usually contains mistakes.',
      },
    ],
  },
  {
    id: 'input', label: 'Never Trust What People Type', phase: 2, icon: '⌨️', steps: [
      {
        kind: 'decide', id: 'input-decide',
        teaching:
          'Every box where a visitor can type is a door into your site. Text is just text — unless your code treats it as ' +
          'instructions. Open src/components/Comments.jsx: it shows comments as raw HTML, and it builds a database query by gluing in the search words.',
        question: 'A visitor posts a comment that contains hidden script code. With dangerouslySetInnerHTML, what happens?',
        options: [
          { id: 'text', label: 'It is shown as plain text', feedback: 'That is what you want — but dangerouslySetInnerHTML does the opposite.' },
          { id: 'run', label: 'It can run as code in every visitor’s browser who views the comment', feedback: 'Correct. This is called XSS (cross-site scripting). The attacker’s code could act as the visitor, steal their session, or change the page.' },
          { id: 'react', label: 'React always blocks it', feedback: 'React blocks it only when you let React render text. The name dangerouslySetInnerHTML is a warning that you turned that protection off.' },
          { id: 'self', label: 'It only affects the person who wrote it', feedback: 'No — stored comments are shown to everyone, so everyone is affected.' },
        ],
        correct: ['run'],
      },
      {
        kind: 'fix', id: 'input-xss', openFile: 'src/components/Comments.jsx',
        teaching: 'The safe default is to let React display user text as text. When you write {c.body}, React escapes anything dangerous for you.',
        instruction: 'In src/components/Comments.jsx, show each comment body as plain text instead of raw HTML.',
        checks: [{
          id: 'no-html', label: 'dangerouslySetInnerHTML is gone',
          test: f => !/dangerouslySetInnerHTML/.test(has(f, 'src/components/Comments.jsx')),
          hints: ['Find the <div> that uses dangerouslySetInnerHTML.', 'Replace it with: <div>{c.body}</div>'],
        }],
        solution: [{
          path: 'src/components/Comments.jsx',
          content: L(
            "import { supabase } from '../lib/supabase.js'",
            '',
            'export function CommentList({ comments }) {',
            '  return (',
            '    <ul>',
            '      {comments.map(c => (',
            '        <li key={c.id}>',
            '          <strong>{c.author}</strong>',
            '          <div>{c.body}</div>',
            '        </li>',
            '      ))}',
            '    </ul>',
            '  )',
            '}',
            '',
            'export async function searchListings(term) {',
            "  // Build the query by gluing the visitor's search words into SQL",
            "  const { data } = await supabase.rpc('run_sql', {",
            "    q: \"select * from listings where name like '%\" + term + \"%'\",",
            '  })',
            '  return data',
            '}',
            '',
          ),
        }],
        solutionNote: 'React now renders the comment as text, so any code inside it is displayed, not run.',
      },
      {
        kind: 'fix', id: 'input-sql', openFile: 'src/components/Comments.jsx',
        teaching:
          'Gluing a visitor’s words into a database command lets them rewrite the command (SQL injection). ' +
          'The fix is to never build commands from text. Use the query helpers, which keep the search words as data.',
        instruction: 'Rewrite searchListings so it uses supabase.from(…).select(…).ilike(…) instead of run_sql with glued-together text.',
        checks: [
          {
            id: 'no-run-sql', label: 'No more run_sql with glued-together text',
            test: f => !/run_sql/.test(has(f, 'src/components/Comments.jsx')),
            hints: ['The risky part is the rpc("run_sql") call with a string built using +.', 'Delete that call. You will replace it with a query helper.'],
          },
          {
            id: 'ilike', label: 'The search uses a query helper (.ilike / .eq / .textSearch)',
            test: f => /\.(ilike|eq|textSearch)\(/.test(has(f, 'src/components/Comments.jsx')),
            hints: ['Supabase builds safe queries for you.', "Use: supabase.from('listings').select('*').ilike('name', '%' + term + '%')"],
          },
        ],
        solution: [{
          path: 'src/components/Comments.jsx',
          content: L(
            "import { supabase } from '../lib/supabase.js'",
            '',
            'export function CommentList({ comments }) {',
            '  return (',
            '    <ul>',
            '      {comments.map(c => (',
            '        <li key={c.id}>',
            '          <strong>{c.author}</strong>',
            '          <div>{c.body}</div>',
            '        </li>',
            '      ))}',
            '    </ul>',
            '  )',
            '}',
            '',
            'export async function searchListings(term) {',
            "  const { data } = await supabase.from('listings').select('*').ilike('name', '%' + term + '%')",
            '  return data',
            '}',
            '',
          ),
        }],
        solutionNote: 'The search words travel as data inside a query helper, so they can never become part of the command.',
      },
      {
        kind: 'explain', id: 'input-explain',
        teaching: 'Both bugs have the same root: treating something a stranger typed as if you wrote it.',
        question: 'What is the one rule you should follow for anything a visitor types?',
        keywords: { groups: [['untrusted', 'never trust', 'not trust', 'dont trust', "don't trust", 'data', 'text', 'plain'], ['code', 'script', 'run', 'execute', 'sql', 'html', 'command', 'instruction']], need: 2 },
        modelAnswer: 'Treat it as untrusted data, never as code. Show it as plain text and pass it through safe query helpers, so it can never run as HTML, script, or SQL.',
      },
    ],
  },
  {
    id: 'database', label: 'Lock the Database (RLS)', phase: 2, icon: '🗄️', steps: [
      {
        kind: 'decide', id: 'db-decide',
        teaching:
          'Your anon key sits in the public website, so assume strangers have it. What decides what they can read or change ' +
          'is not the key — it is Row Level Security (RLS): rules inside the database that say who may touch which rows.',
        question: 'A stranger has your anon key. What actually stops them reading every order (with phone numbers)?',
        options: [
          { id: 'nothing', label: 'Nothing, the key gives full access', feedback: 'Only true if RLS is off. Which is exactly the situation in schema.sql right now.' },
          { id: 'rls', label: 'RLS policies on the orders table', feedback: 'Correct. With RLS on and no matching policy, the database refuses. Policies open up only what you allow.' },
          { id: 'hide', label: 'Hiding the key in the page', feedback: 'Anything that reaches the browser can be found. Hiding is not protection.' },
          { id: 'nav', label: 'The login button in the navbar', feedback: 'A button only changes what the page shows. Strangers can call the database directly, skipping your page.' },
        ],
        correct: ['rls'],
      },
      {
        kind: 'fix', id: 'db-enable', openFile: 'supabase/schema.sql',
        teaching: 'RLS is off by default on new tables. The command is: alter table <name> enable row level security;. Once on, the database denies everything until you add policies.',
        instruction: 'Turn on RLS for both the listings and the orders tables in supabase/schema.sql.',
        checks: [
          {
            id: 'rls-listings', label: 'RLS is enabled on listings',
            test: f => statements(has(f, 'supabase/schema.sql')).some(s => /alter\s+table\s+(public\.)?listings\s+enable\s+row\s+level\s+security/i.test(s)),
            hints: ['Add one command per table at the bottom of the file.', 'alter table listings enable row level security;'],
          },
          {
            id: 'rls-orders', label: 'RLS is enabled on orders',
            test: f => statements(has(f, 'supabase/schema.sql')).some(s => /alter\s+table\s+(public\.)?orders\s+enable\s+row\s+level\s+security/i.test(s)),
            hints: ['Do the same for the orders table, which holds phone numbers.', 'alter table orders enable row level security;'],
          },
        ],
        solution: [{
          path: 'supabase/schema.sql',
          content: L(
            'create table listings (',
            '  id uuid primary key default gen_random_uuid(),',
            '  name text not null,',
            '  price numeric not null,',
            '  seller_id uuid references auth.users(id)',
            ');',
            '',
            'create table orders (',
            '  id uuid primary key default gen_random_uuid(),',
            '  listing_id uuid references listings(id),',
            '  user_id uuid references auth.users(id),',
            '  phone text,',
            '  created_at timestamptz default now()',
            ');',
            '',
            'alter table listings enable row level security;',
            'alter table orders enable row level security;',
            '',
            '-- TODO: who is allowed to see these tables?',
            '',
          ),
        }],
        solutionNote: 'Both tables now deny everything by default until a policy allows it.',
      },
      {
        kind: 'fix', id: 'db-policies', openFile: 'supabase/schema.sql',
        teaching:
          'A policy is a rule. auth.uid() is the signed-in person’s id, so using (auth.uid() = user_id) means “only the owner’s rows”. ' +
          'Listings are meant to be public, so anyone may read them. Orders are private, so only their owner may read them.',
        instruction: 'Add two policies: anyone can read listings; only the owner (user_id = auth.uid()) can read their own orders.',
        checks: [
          {
            id: 'pol-listings', label: 'A policy lets everyone read listings (using (true))',
            test: f => statements(has(f, 'supabase/schema.sql')).some(s => /create\s+policy/i.test(s) && /on\s+(public\.)?listings/i.test(s) && /for\s+select/i.test(s) && /using\s*\(\s*true\s*\)/i.test(s)),
            hints: ['Policies read like sentences: create policy "name" on table for select using (rule);', 'create policy "Anyone can read listings" on listings for select using (true);'],
          },
          {
            id: 'pol-orders', label: 'A policy lets only the owner read their orders',
            test: f => statements(has(f, 'supabase/schema.sql')).some(s => /create\s+policy/i.test(s) && /on\s+(public\.)?orders/i.test(s) && /for\s+select/i.test(s) && /auth\.uid\(\)\s*=\s*user_id|user_id\s*=\s*auth\.uid\(\)/i.test(s)),
            hints: ['The rule must compare the row’s owner to the signed-in person.', 'create policy "Owners read own orders" on orders for select using (auth.uid() = user_id);'],
          },
        ],
        solution: [{
          path: 'supabase/schema.sql',
          content: L(
            'create table listings (',
            '  id uuid primary key default gen_random_uuid(),',
            '  name text not null,',
            '  price numeric not null,',
            '  seller_id uuid references auth.users(id)',
            ');',
            '',
            'create table orders (',
            '  id uuid primary key default gen_random_uuid(),',
            '  listing_id uuid references listings(id),',
            '  user_id uuid references auth.users(id),',
            '  phone text,',
            '  created_at timestamptz default now()',
            ');',
            '',
            'alter table listings enable row level security;',
            'alter table orders enable row level security;',
            '',
            'create policy "Anyone can read listings" on listings for select using (true);',
            'create policy "Owners read own orders" on orders for select using (auth.uid() = user_id);',
            '',
          ),
        }],
        solutionNote: 'Public data is readable by all; private data is readable only by its owner.',
      },
      {
        kind: 'explain', id: 'db-explain',
        teaching: 'Supabase gives you two keys. The anon key is for the browser. The service_role key skips all RLS and is for trusted servers only.',
        question: 'What is the difference between the anon key and the service_role key, and where may each one live?',
        keywords: { groups: [['anon', 'public', 'browser'], ['service', 'secret', 'server', 'never', 'bypass', 'skips']], need: 2 },
        modelAnswer: 'The anon key is public and safe in the browser because RLS limits it. The service_role key bypasses RLS, so it is a secret that may live only on a trusted server, never in browser code.',
      },
    ],
  },

  // ── Phase 3: Defend ───────────────────────────────────────────────────────
  {
    id: 'supply_chain', label: 'Trust Your Packages', phase: 3, icon: '📦', steps: [
      {
        kind: 'decide', id: 'sc-decide',
        teaching:
          'Your project is built from other people’s packages. Installing one runs someone else’s code on your computer and ships it to your visitors. ' +
          'Attackers publish packages with names one letter away from popular ones and wait for a typo.',
        question: 'Open package.json. Which dependency looks wrong?',
        options: [
          { id: 'dom', label: 'react-dom', feedback: 'This is the real, official package.' },
          { id: 'routr', label: 'react-routr-dom', feedback: 'Correct. The real package is react-router-dom. A one-letter typo like this can install an impostor.' },
          { id: 'supa', label: '@supabase/supabase-js', feedback: 'This is the real, official Supabase package (note the @supabase scope).' },
          { id: 'vite', label: 'vite', feedback: 'This is the real, official build tool.' },
        ],
        correct: ['routr'],
      },
      {
        kind: 'fix', id: 'sc-fix', openFile: 'package.json',
        teaching: 'Before installing anything, check the exact spelling against the project’s official page, and look at its download count and age. Fix the typo, then reinstall from a clean slate.',
        instruction: 'Fix the misspelled dependency in package.json.',
        checks: [
          {
            id: 'no-typo', label: 'react-routr-dom is gone',
            test: f => !/react-routr-dom/.test(has(f, 'package.json')),
            hints: ['Look closely at the router package name.', 'Remove the misspelled entry.'],
          },
          {
            id: 'right', label: 'react-router-dom is listed instead',
            test: f => /"react-router-dom"/.test(has(f, 'package.json')),
            hints: ['The real name has an “e” in router.', 'Use "react-router-dom": "^6.21.0".'],
          },
        ],
        solution: [{
          path: 'package.json',
          content: L(
            '{',
            '  "name": "village-market",',
            '  "private": true,',
            '  "version": "0.1.0",',
            '  "type": "module",',
            '  "scripts": { "dev": "vite", "build": "vite build" },',
            '  "dependencies": {',
            '    "react": "^18.2.0",',
            '    "react-dom": "^18.2.0",',
            '    "react-router-dom": "^6.21.0",',
            '    "@supabase/supabase-js": "^2.39.0"',
            '  },',
            '  "devDependencies": { "vite": "^5.0.8", "@vitejs/plugin-react": "^4.2.1" }',
            '}',
            '',
          ),
        }],
        solutionNote: 'The real, official router package is used.',
      },
      {
        kind: 'fix', id: 'sc-dependabot', openFile: '.github/dependabot.yml',
        teaching: 'Even good packages find bugs later. Dependabot checks your dependencies on a schedule and opens a pull request when an update fixes a known problem.',
        instruction: 'In .github/dependabot.yml, ask GitHub to check your npm packages every week.',
        checks: [
          {
            id: 'version', label: 'The file starts with version: 2',
            test: f => /^version:\s*2\s*$/m.test(has(f, '.github/dependabot.yml')),
            hints: ['Dependabot files begin with a version line.', 'Add: version: 2'],
          },
          {
            id: 'npm', label: 'It watches the npm ecosystem',
            test: f => /package-ecosystem:\s*["']?npm["']?/.test(has(f, '.github/dependabot.yml')),
            hints: ['Tell it which kind of packages to watch.', 'package-ecosystem: "npm"'],
          },
          {
            id: 'schedule', label: 'It has a schedule interval',
            test: f => /schedule:/.test(has(f, '.github/dependabot.yml')) && /interval:\s*["']?(daily|weekly|monthly)["']?/.test(has(f, '.github/dependabot.yml')),
            hints: ['Say how often to check.', 'schedule:\n      interval: "weekly"'],
          },
        ],
        solution: [{
          path: '.github/dependabot.yml',
          content: L(
            'version: 2',
            'updates:',
            '  - package-ecosystem: "npm"',
            '    directory: "/"',
            '    schedule:',
            '      interval: "weekly"',
            '',
          ),
        }],
        solutionNote: 'GitHub now checks your npm packages weekly and proposes security updates.',
      },
      {
        kind: 'explain', id: 'sc-explain',
        teaching: 'Every package is a stranger you let into your project. Pick them carefully, and keep them updated.',
        question: 'Why can installing a package be as risky as running a program from a stranger?',
        keywords: { groups: [['run', 'code', 'execute', 'script', 'access', 'install'], ['trust', 'stranger', 'unknown', 'malicious', 'typo', 'impostor', 'fake', 'someone else']], need: 2 },
        modelAnswer: 'A package is someone else’s code that runs on your machine and ships to your visitors. A fake or malicious one, often reached through a typo, gets that same access.',
      },
    ],
  },
  {
    id: 'github_guard', label: 'GitHub: Guard Your Repo', phase: 3, icon: '🏰', steps: [
      {
        kind: 'decide', id: 'gg-decide',
        teaching: 'Most repo accidents are not attacks — they are one tired person pushing broken or unsafe code straight to the main branch. Branch protection puts a gate in front of main.',
        question: 'Which setting stops anyone, including you, from pushing straight to main without review?',
        options: [
          { id: 'public', label: 'Make the repository public', feedback: 'That shows your code to more people. It does not control who can change it.' },
          { id: 'protect', label: 'Branch protection that requires a pull request and review', feedback: 'Correct. Changes must go through a pull request, so another person (and automatic checks) look at it first.' },
          { id: 'rename', label: 'Rename main to something secret', feedback: 'Obscurity is not a lock. Anyone with access can find the branch.' },
          { id: 'readme', label: 'Add a longer README', feedback: 'A README explains the project. It cannot enforce anything.' },
        ],
        correct: ['protect'],
      },
      {
        kind: 'fix', id: 'gg-ci', openFile: '.github/workflows/ci.yml',
        teaching:
          'GitHub Actions run with a built-in token. By default give it only what it needs (read access). ' +
          'And never use an action by a moving name like @main: if its author’s account is hacked, your build runs the attacker’s code. Pin to a fixed version.',
        instruction: 'In ci.yml, replace permissions: write-all with read-only, and pin both actions to a fixed version instead of @main.',
        checks: [
          {
            id: 'no-write-all', label: 'No more permissions: write-all',
            test: f => !/permissions:\s*write-all/.test(has(f, '.github/workflows/ci.yml')),
            hints: ['write-all lets this workflow change almost everything in your repo.', 'Replace that line with a permissions block.'],
          },
          {
            id: 'read', label: 'The workflow only has contents: read',
            test: f => /permissions:\s*\n\s+contents:\s*read/.test(has(f, '.github/workflows/ci.yml')),
            hints: ['Grant the smallest permission that lets the build work.', 'permissions:\n  contents: read'],
          },
          {
            id: 'pinned', label: 'Actions are pinned to a version (not @main or @master)',
            test: f => !/uses:\s*\S+@(main|master)\b/.test(has(f, '.github/workflows/ci.yml')),
            hints: ['Look at the two lines that start with uses:.', 'Change @main to a fixed version, for example actions/checkout@v4 and actions/setup-node@v4.'],
          },
        ],
        solution: [{
          path: '.github/workflows/ci.yml',
          content: L(
            'name: CI',
            'on: [push, pull_request]',
            'permissions:',
            '  contents: read',
            'jobs:',
            '  build:',
            '    runs-on: ubuntu-latest',
            '    steps:',
            '      - uses: actions/checkout@v4',
            '      - uses: actions/setup-node@v4',
            '        with:',
            '          node-version: 20',
            '      - run: npm ci',
            '      - run: npm run build',
            '',
          ),
        }],
        solutionNote: 'The build can only read the repo, and it uses fixed versions of its actions.',
      },
      {
        kind: 'fix', id: 'gg-owners', openFile: '.github/CODEOWNERS',
        teaching: 'CODEOWNERS names who must review changes to which files. Pair it with branch protection and the most sensitive files (workflows, auth, database rules) always get a careful second look.',
        instruction: 'In .github/CODEOWNERS, make @your-github-name the default owner of everything, and make them the owner of the .github/ folder too.',
        checks: [
          {
            id: 'default', label: 'A default rule covers every file (* @owner)',
            test: f => nonComment(has(f, '.github/CODEOWNERS')).some(l => /^\*\s+@\S+/.test(l.trim())),
            hints: ['Each line is: a file pattern, then an owner starting with @.', 'The pattern * means everything: * @your-github-name'],
          },
          {
            id: 'workflows', label: 'The .github/ folder has an owner',
            test: f => nonComment(has(f, '.github/CODEOWNERS')).some(l => /^\/?\.github\/?\S*\s+@\S+/.test(l.trim())),
            hints: ['Workflows are powerful, so they deserve their own line.', '/.github/ @your-github-name'],
          },
        ],
        solution: [{
          path: '.github/CODEOWNERS',
          content: L('* @your-github-name', '/.github/ @your-github-name', ''),
        }],
        solutionNote: 'Every change now has a named reviewer, and the workflows folder is called out.',
      },
      {
        kind: 'checklist', id: 'gg-checklist',
        teaching: 'Files in the repo are only half the picture. The rest lives in GitHub’s settings, where you switch the gate on.',
        instruction: 'Tick each once you have set it on a repo of your own — or once you understand where it lives and what it stops. Nothing here changes your account.',
        items: [
          { id: 'pr', label: 'Require a pull request before merging', where: 'Repo → Settings → Branches → Add rule → main', stops: 'Direct pushes to main with no review.' },
          { id: 'checks', label: 'Require status checks (your CI build) to pass', where: 'Same rule → Require status checks to pass', stops: 'Merging code that does not even build or pass tests.' },
          { id: 'owners', label: 'Require review from Code Owners', where: 'Same rule → Require review from Code Owners', stops: 'Changes to sensitive files with no one responsible looking.' },
          { id: 'token', label: 'Use fine-grained tokens with an expiry date, never an all-powerful classic token', where: 'Your profile → Settings → Developer settings → Fine-grained tokens', stops: 'A stolen token being able to do everything, forever.' },
        ],
      },
    ],
  },
  {
    id: 'ai_privacy', label: 'Using AI Safely', phase: 3, icon: '🤖', steps: [
      {
        kind: 'decide', id: 'ai-decide', multi: true,
        teaching:
          'AI assistants are powerful, but whatever you paste is sent to another company’s servers. Treat an AI chat like a public message board: ' +
          'share the problem, not the secrets, and never share other people’s private details.',
        question: 'Which TWO things are safe to paste into an AI chat?',
        options: [
          { id: 'err', label: 'An error message, after removing names and keys from it', feedback: 'Safe. Cleaned error messages are exactly what AI is good at helping with.' },
          { id: 'key', label: 'Your live API key so the AI can test it', feedback: 'Never. The AI cannot use it, and you have just sent a secret to a third party.' },
          { id: 'cust', label: 'A customer’s name and phone number to reproduce the bug', feedback: 'Never. That person did not agree to this. Use made-up sample data.' },
          { id: 'code', label: 'A function with the secrets replaced by placeholders', feedback: 'Safe. Placeholders keep the structure and remove the risk.' },
        ],
        correct: ['err', 'code'],
      },
      {
        kind: 'fix', id: 'ai-fix', openFile: 'ai-notes.md',
        teaching: 'Redacting means replacing private details with obvious placeholders before you send anything. Keep the question — remove the secrets and the person.',
        instruction: 'Rewrite the prompt in ai-notes.md so it still asks about the checkout, but contains no key and no customer details.',
        checks: [
          {
            id: 'no-key', label: 'The API key is gone',
            test: f => !/pay_secret_/i.test(has(f, 'ai-notes.md')),
            hints: ['Find the key that starts with pay_secret_.', 'Replace it with [API_KEY] or just delete the sentence.'],
          },
          {
            id: 'no-phone', label: 'The phone number is gone',
            test: f => !/\d[\d\s-]{8,}\d/.test(has(f, 'ai-notes.md')),
            hints: ['A long run of digits is a phone number.', 'Remove it. The AI does not need it to help with checkout.'],
          },
          {
            id: 'no-name', label: 'The customer’s name is gone',
            test: f => !/amina|bello/i.test(has(f, 'ai-notes.md')),
            hints: ['Look for a real person’s name.', 'Say “a customer” instead of using their name.'],
          },
          {
            id: 'question', label: 'The checkout question is still there',
            test: f => /checkout/i.test(has(f, 'ai-notes.md')),
            hints: ['Do not delete the whole prompt — you still want help.', 'Keep a sentence like: My checkout is failing and a customer’s order disappeared. Can you help me find why?'],
          },
        ],
        solution: [{
          path: 'ai-notes.md',
          content: L(
            '# My AI chat log',
            '',
            'Prompt I sent today:',
            '',
            '> My checkout is failing. A customer says her order disappeared after she paid.',
            '> The payment key is stored in an environment variable. Can you fix my checkout?',
            '',
          ),
        }],
        solutionNote: 'The prompt keeps the problem and drops the key, the name, and the phone number.',
      },
      {
        kind: 'decide', id: 'ai-review',
        teaching: 'AI writes code that looks confident whether or not it is safe. It can repeat every mistake in this lab: hard-coded keys, missing RLS, glued-together queries, fake package names.',
        question: 'The AI wrote you a login function and it works. What do you do before merging it?',
        options: [
          { id: 'merge', label: 'Merge it — it works', feedback: 'Working is not the same as safe. Most of this lab’s bugs also “worked”.' },
          { id: 'review', label: 'Read it, test it, and check it for the problems from this lab before opening a pull request', feedback: 'Correct. You are the reviewer. Check secrets, inputs, access rules, and packages every time.' },
          { id: 'ask', label: 'Ask the AI if its own code is safe, and trust the answer', feedback: 'It can help you review, but it can also be confidently wrong. The responsibility stays with you.' },
          { id: 'hide', label: 'Keep quiet about using AI', feedback: 'Hiding it makes review worse. Say so in the pull request so reviewers look harder.' },
        ],
        correct: ['review'],
      },
      {
        kind: 'explain', id: 'ai-explain',
        teaching: 'A short personal checklist is the best defence, because you will use it even when you are in a hurry.',
        question: 'Name two things you will check on any AI-written code before you trust it.',
        keywords: {
          groups: [['secret', 'key', 'password', 'env'], ['input', 'sql', 'html', 'xss', 'sanitize', 'escape'], ['auth', 'login', 'rls', 'permission', 'access'], ['package', 'dependency', 'library', 'npm']],
          need: 2,
        },
        modelAnswer: 'For example: check there are no keys or passwords in the code, and check that anything a user types is handled as plain data. Also check access rules (RLS) and that every package is real.',
      },
    ],
  },
  {
    id: 'capstone', label: 'Capstone: Security Review', phase: 3, icon: '🏁', steps: [
      {
        kind: 'decide', id: 'cap-decide',
        teaching: 'Real security work is mostly prioritising. You rarely have time to fix everything, so you fix what hurts most and is easiest to exploit first.',
        question: 'You have 30 minutes before a demo and four findings. Which do you fix FIRST?',
        options: [
          { id: 'key', label: 'A live payment key in a public commit', feedback: 'Correct. It is usable right now by anyone, and it can cost real money. Rotate it first.' },
          { id: 'rls', label: 'An orders table with RLS still switched off', feedback: 'Serious and next in line — but it needs someone to find your anon key and look. The leaked key is already exposed.' },
          { id: 'typo', label: 'A spelling mistake in the footer', feedback: 'Cosmetic. Fix it after the security problems.' },
          { id: 'dev', label: 'An old development-only dependency', feedback: 'Worth updating, but it is not shipped to visitors, so it ranks lower.' },
        ],
        correct: ['key'],
      },
      {
        kind: 'fix', id: 'cap-security-md', openFile: 'SECURITY.md',
        teaching: 'A SECURITY.md file tells honest finders how to report a problem privately, instead of posting it publicly where attackers can read it too.',
        instruction: 'Write SECURITY.md so it says how to report a problem (an email or GitHub’s private report), that people should not post it publicly, and how fast you will reply.',
        checks: [
          {
            id: 'contact', label: 'It gives a way to report (an email address or GitHub private advisory)',
            test: f => /[\w.+-]+@[\w-]+\.[\w.]+/.test(has(f, 'SECURITY.md')) || /security advisor/i.test(has(f, 'SECURITY.md')),
            hints: ['Where should a finder send their report?', 'Give an email like security@yourproject.org, or say to use “Report a vulnerability” under the Security tab.'],
          },
          {
            id: 'private', label: 'It asks people not to post the problem publicly',
            test: f => /(do not|don't|please do not|never)[^\n.]*(public|issue|post)/i.test(has(f, 'SECURITY.md')),
            hints: ['Public reports help attackers too.', 'Add a sentence like: Please do not post security problems in public issues.'],
          },
          {
            id: 'time', label: 'It promises a reply time (for example, within 3 days)',
            test: f => /\d+\s*(business\s+)?(hour|day|week)/i.test(has(f, 'SECURITY.md')),
            hints: ['Finders want to know they were heard.', 'Add: We will reply within 3 days.'],
          },
        ],
        solution: [{
          path: 'SECURITY.md',
          content: L(
            '# Security',
            '',
            'Found a security problem? Please tell us privately at security@villagemarket.example.',
            'Please do not post security problems in public issues.',
            'We will reply within 3 days.',
            '',
          ),
        }],
        solutionNote: 'Finders now know where to report, to keep it private, and when to expect an answer.',
      },
      {
        kind: 'explain', id: 'cap-explain',
        teaching: 'You have now fixed secrets, logins, inputs, the database, packages, the repository, and AI use. Turn it into habits.',
        question: 'Write your top 3 security habits for your own projects, in your own words.',
        keywords: {
          groups: [['secret', 'key', 'env', 'gitignore', 'password'], ['rls', 'auth', 'permission', 'access', 'login'], ['input', 'sanitize', 'escape', 'sql', 'html'], ['dependabot', 'package', 'dependency', 'update'], ['branch', 'review', 'pull request', 'codeowners'], ['ai', 'verify', 'check', 'test']],
          need: 3,
        },
        modelAnswer: 'For example: never commit secrets and use .env; turn on RLS and check access rules; treat user input as data; keep packages updated; review everything, including AI-written code, through a pull request.',
      },
    ],
  },
];

export const PHASE_META: Record<Phase, { label: string; color: string; bg: string; border: string }> = {
  1: { label: 'Phase 1: Spot',    color: 'text-red-400',     bg: 'bg-red-500/15',     border: 'border-red-500/30' },
  2: { label: 'Phase 2: Protect', color: 'text-blue-400',    bg: 'bg-blue-500/15',    border: 'border-blue-500/30' },
  3: { label: 'Phase 3: Defend',  color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' },
};

// ─── Pure helpers (kept here so they can be unit-tested) ─────────────────────

export interface CheckResult { id: string; label: string; pass: boolean; }

export function runChecks(checks: Check[], files: FileMap): CheckResult[] {
  return checks.map(c => ({ id: c.id, label: c.label, pass: c.test(files) }));
}

/** Which hint to show after `misses` failed attempts (0 = none yet). Moves from nudge to near-answer. */
export function hintFor(check: Check, misses: number): string | null {
  if (misses <= 0) return null;
  return check.hints[Math.min(misses, check.hints.length) - 1] ?? null;
}

export function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
}

/** Fallback review for an explain step when the AI coach cannot be reached. */
export function keywordReview(answer: string, kw: { groups: string[][]; need: number }): boolean {
  const text = answer.toLowerCase();
  if (text.trim().length < 15) return false;
  const hit = kw.groups.filter(g => g.some(w => text.includes(w))).length;
  return hit >= kw.need;
}

export const totalSteps = (): number => TASKS.reduce((n, t) => n + t.steps.length, 0);
