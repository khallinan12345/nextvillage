// src/pages/tech-skills/securityCert/certRepo.ts
//
// The fixed practice repo for the Security & Safety Certification: "Riverside Clinic", a small appointment-booking site.
// Every learner gets exactly this repo. It is a different repo from the Security & Safety Lab's "Village Market", so
// nothing can be passed by remembering the lab's answers, and the certification gives no hints.
//
// The grading checks are NOT here — they live on the server (api/_lib/securityCert.js) and re-check the files the
// learner submits. api/_lib/securityCert.test.js proves this repo scores 0 on every file-checked criterion as shipped.

export interface ProjectFile { path: string; content: string; }

const L = (...lines: string[]) => lines.join('\n');

export const CERT_REPO: ProjectFile[] = [
  {
    path: 'README.md',
    content: L(
      '# Riverside Clinic',
      '',
      'A small site where patients book appointments at their local clinic.',
      '',
      'This is your certification repo. It contains security mistakes: find as many as you can and fix them.',
      'There are no hints. When you are done, write your security review and submit.',
      '',
    ),
  },
  {
    path: 'package.json',
    content: L(
      '{',
      '  "name": "riverside-clinic",',
      '  "private": true,',
      '  "version": "0.3.0",',
      '  "type": "module",',
      '  "scripts": { "dev": "vite", "build": "vite build" },',
      '  "dependencies": {',
      '    "react": "^18.2.0",',
      '    "react-dom": "^18.2.0",',
      '    "react-router-dom": "^6.21.0",',
      '    "@supabse/supabase-js": "^2.39.0"',
      '  },',
      '  "devDependencies": { "vite": "^5.0.8", "@vitejs/plugin-react": "^4.2.1" }',
      '}',
      '',
    ),
  },
  {
    path: 'src/lib/settings.js',
    content: L(
      '// Riverside Clinic settings',
      "export const API_URL = 'https://riverside.example.com/api'",
      "export const SMS_SECRET = 'sms_secret_RIVERSIDE7Lm2QxP9vTn4WzK8'",
      "export const DB_PASSWORD = 'clinic#2024'",
      '',
    ),
  },
  {
    path: 'src/lib/supabase.js',
    content: L(
      "import { createClient } from '@supabase/supabase-js'",
      '',
      "const SERVICE_ROLE_KEY = 'service_role_RIVERSIDE0aB1cD2eF3gH4iJ5kL'",
      "export const supabase = createClient('https://riv1234.supabase.co', SERVICE_ROLE_KEY)",
      '',
    ),
  },
  {
    path: '.env',
    content: L('VITE_SUPABASE_URL=https://riv1234.supabase.co', 'SMS_SECRET=sms_secret_RIVERSIDE7Lm2QxP9vTn4WzK8', ''),
  },
  { path: '.env.example', content: L('# TODO', '') },
  { path: '.gitignore', content: L('node_modules', 'dist', '') },
  {
    path: 'src/lib/accounts.js',
    content: L(
      "import { supabase } from './supabase.js'",
      '',
      'export async function register(email, password, name) {',
      "  return supabase.from('patients').insert({ email, password, name })",
      '}',
      '',
      'export async function login(email, password) {',
      '  const { data } = await supabase',
      "    .from('patients')",
      "    .select('*')",
      "    .eq('email', email)",
      "    .eq('password', password)",
      '    .single()',
      '  return data',
      '}',
      '',
    ),
  },
  {
    path: 'src/components/Notes.jsx',
    content: L(
      "import { supabase } from '../lib/supabase.js'",
      '',
      'export function NoteList({ notes }) {',
      '  return (',
      '    <ul>',
      '      {notes.map(n => (',
      '        <li key={n.id}>',
      '          <h3>{n.title}</h3>',
      '          <p dangerouslySetInnerHTML={{ __html: n.body }} />',
      '        </li>',
      '      ))}',
      '    </ul>',
      '  )',
      '}',
      '',
      'export async function findPatient(name) {',
      "  const { data } = await supabase.rpc('exec_sql', {",
      "    query: \"select * from patients where name = '\" + name + \"'\",",
      '  })',
      '  return data',
      '}',
      '',
    ),
  },
  {
    path: 'supabase/schema.sql',
    content: L(
      'create table clinics (',
      '  id uuid primary key default gen_random_uuid(),',
      '  name text not null,',
      '  address text',
      ');',
      '',
      'create table patients (',
      '  id uuid primary key default gen_random_uuid(),',
      '  user_id uuid references auth.users(id),',
      '  name text not null,',
      '  phone text,',
      '  notes text',
      ');',
      '',
      'create table appointments (',
      '  id uuid primary key default gen_random_uuid(),',
      '  patient_id uuid references patients(id),',
      '  user_id uuid references auth.users(id),',
      '  slot timestamptz not null,',
      '  reason text',
      ');',
      '',
    ),
  },
  {
    path: '.github/workflows/deploy.yml',
    content: L(
      'name: Deploy',
      'on: [push]',
      'permissions: write-all',
      'jobs:',
      '  deploy:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@main',
      '      - run: npm ci && npm run build',
      '      - uses: some-vendor/deploy-action@master',
      '        with:',
      '          token: ${{ secrets.DEPLOY_TOKEN }}',
      '',
    ),
  },
  { path: '.github/dependabot.yml', content: L('# TODO', '') },
  { path: '.github/CODEOWNERS', content: L('# TODO', '') },
  {
    path: 'ai-prompt-log.md',
    content: L(
      '# AI prompt log',
      '',
      '> Reminders are not sending. My SMS key is sms_secret_RIVERSIDE7Lm2QxP9vTn4WzK8 and patient',
      '> Grace Adeyemi (0803 555 0199) says she never got her appointment text. Can you fix the appointment reminders?',
      '',
    ),
  },
  { path: 'SECURITY.md', content: L('# Security', '') },
];

/** Shown to the learner. Names must match api/_lib/securityCert.js (a test enforces it). Deliberately not a checklist. */
export const CERT_CRITERIA: { name: string; description: string }[] = [
  { name: 'Secrets & Configuration', description: 'Keep secrets and keys out of code and out of Git, and put public settings where they belong.' },
  { name: 'Passwords & Login', description: 'Handle accounts and passwords the way a safe system does.' },
  { name: 'Untrusted Input', description: 'Treat everything a visitor types as untrusted.' },
  { name: 'Database Access Rules', description: 'Make sure the database only shows each person what they are allowed to see.' },
  { name: 'Repository & Dependency Defences', description: 'Harden the GitHub workflow, the packages, and who must review changes.' },
  { name: 'Safe AI Use & Disclosure', description: 'Share with AI tools safely, and give honest finders a way to report problems.' },
  { name: 'Written Security Review', description: 'Explain what you found, what you fixed first and why, and which GitHub protections you would switch on.' },
];
