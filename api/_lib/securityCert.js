// api/_lib/securityCert.js
//
// Grading for the Security & Safety Certification (/certifications/security-safety).
//
// The certification gives every learner the SAME practice repo ("Riverside Clinic", src/pages/tech-skills/securityCert/
// certRepo.ts) with security mistakes planted in it and no hints. They fix it and write a short security review.
// The checks live here, on the server, on purpose: they are not shipped to the browser, and the learner's submitted
// files are re-checked here, so the page cannot be made to claim a pass.
//
// Six criteria are scored by file checks, one by an AI-reviewed written note (api/security-certification.ts).
// Scores are 0–3 like every other certification: 3 = every requirement met, 2 = at least two thirds, 1 = some, 0 = none.
// A criterion at 2 or above is "Proficient"; the certificate needs every criterion at Proficient or better.

export const CERT_ACTIVITY = 'Security & Safety Certification';
export const MAX_FILE_CHARS = 20000;

const get = (f, p) => (typeof f[p] === 'string' ? f[p] : '');
const statements = (sql) => sql.split(';').map((s) => s.trim()).filter(Boolean);
const nonComment = (t) => t.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));

// A minimum-length check counts only if it really enforces 8+ characters.
function enforcesMinLength(code) {
  const m = code.match(/password\.length\s*(<=|>=|<|>)\s*(\d+)/);
  if (!m) return false;
  const n = Number(m[2]);
  return (m[1] === '<' || m[1] === '>=') ? n >= 8 : n >= 7;
}

const ownerPolicy = (sql, table) =>
  statements(sql).some((s) =>
    /create\s+policy/i.test(s)
    && new RegExp(`on\\s+(public\\.)?${table}\\b`, 'i').test(s)
    && /auth\.uid\(\)\s*=\s*user_id|user_id\s*=\s*auth\.uid\(\)/i.test(s)
    && !/using\s*\(\s*true\s*\)/i.test(s));

const rlsOn = (sql, table) =>
  statements(sql).some((s) => new RegExp(`alter\\s+table\\s+(public\\.)?${table}\\s+enable\\s+row\\s+level\\s+security`, 'i').test(s));

const KEPT_QUESTION = /appointment|reminder/i;

export const CRITERIA = [
  {
    key: 'secrets',
    name: 'Secrets & Configuration',
    checks: [
      (f) => !/sms_secret_/i.test(get(f, 'src/lib/settings.js')),
      (f) => !/DB_PASSWORD\s*=/.test(get(f, 'src/lib/settings.js')) && !/clinic#2024/.test(get(f, 'src/lib/settings.js')),
      (f) => get(f, 'src/lib/supabase.js').trim().length > 0 && !/service_role/i.test(get(f, 'src/lib/supabase.js')),
      (f) => /import\.meta\.env\.VITE_SUPABASE_ANON_KEY/.test(get(f, 'src/lib/supabase.js')),
      (f) => /^\s*\.env\s*$/m.test(get(f, '.gitignore')),
      (f) => get(f, '.env').trim().length > 0 && !/sms_secret_/i.test(get(f, '.env')),
      (f) => /VITE_SUPABASE_URL=/.test(get(f, '.env.example')) && /VITE_SUPABASE_ANON_KEY=/.test(get(f, '.env.example')) && !/sms_secret_/i.test(get(f, '.env.example')),
    ],
  },
  {
    key: 'auth',
    name: 'Passwords & Login',
    checks: [
      (f) => get(f, 'src/lib/accounts.js').trim().length > 0 && !/insert\(\s*\{[^}]*\bpassword\b/.test(get(f, 'src/lib/accounts.js')),
      (f) => get(f, 'src/lib/accounts.js').trim().length > 0 && !/\.eq\(\s*['"]password['"]/.test(get(f, 'src/lib/accounts.js')),
      (f) => /supabase\.auth\.signUp\s*\(/.test(get(f, 'src/lib/accounts.js')),
      (f) => /supabase\.auth\.signInWithPassword\s*\(/.test(get(f, 'src/lib/accounts.js')),
      (f) => enforcesMinLength(get(f, 'src/lib/accounts.js')),
    ],
  },
  {
    key: 'input',
    name: 'Untrusted Input',
    checks: [
      (f) => get(f, 'src/components/Notes.jsx').trim().length > 0 && !/dangerouslySetInnerHTML/.test(get(f, 'src/components/Notes.jsx')),
      (f) => /\{\s*n\.body\s*\}/.test(get(f, 'src/components/Notes.jsx')),
      (f) => get(f, 'src/components/Notes.jsx').trim().length > 0 && !/exec_sql/.test(get(f, 'src/components/Notes.jsx')),
      (f) => /\.(eq|ilike|textSearch)\(/.test(get(f, 'src/components/Notes.jsx')),
    ],
  },
  {
    key: 'database',
    name: 'Database Access Rules',
    checks: [
      (f) => rlsOn(get(f, 'supabase/schema.sql'), 'clinics'),
      (f) => rlsOn(get(f, 'supabase/schema.sql'), 'patients'),
      (f) => rlsOn(get(f, 'supabase/schema.sql'), 'appointments'),
      (f) => statements(get(f, 'supabase/schema.sql')).some((s) =>
        /create\s+policy/i.test(s) && /on\s+(public\.)?clinics\b/i.test(s) && /for\s+select/i.test(s) && /using\s*\(\s*true\s*\)/i.test(s)),
      (f) => ownerPolicy(get(f, 'supabase/schema.sql'), 'patients'),
      (f) => ownerPolicy(get(f, 'supabase/schema.sql'), 'appointments'),
    ],
  },
  {
    key: 'repo',
    name: 'Repository & Dependency Defences',
    checks: [
      (f) => get(f, '.github/workflows/deploy.yml').trim().length > 0 && !/permissions:\s*write-all/.test(get(f, '.github/workflows/deploy.yml')),
      (f) => /permissions:\s*\n\s+contents:\s*read/.test(get(f, '.github/workflows/deploy.yml')),
      (f) => get(f, '.github/workflows/deploy.yml').trim().length > 0 && !/uses:\s*\S+@(main|master)\b/.test(get(f, '.github/workflows/deploy.yml')),
      (f) => /package-ecosystem:\s*["']?npm["']?/.test(get(f, '.github/dependabot.yml')) && /interval:\s*["']?(daily|weekly|monthly)["']?/.test(get(f, '.github/dependabot.yml')),
      (f) => nonComment(get(f, '.github/CODEOWNERS')).some((l) => /^\*\s+@\S+/.test(l.trim())),
      (f) => nonComment(get(f, '.github/CODEOWNERS')).some((l) => /^\/?\.github\/?\S*\s+@\S+/.test(l.trim())),
      (f) => /"@supabase\/supabase-js"/.test(get(f, 'package.json')) && !/@supabse\//.test(get(f, 'package.json')),
    ],
  },
  {
    key: 'ai',
    name: 'Safe AI Use & Disclosure',
    checks: [
      (f) => KEPT_QUESTION.test(get(f, 'ai-prompt-log.md')) && !/sms_secret_/i.test(get(f, 'ai-prompt-log.md')),
      (f) => KEPT_QUESTION.test(get(f, 'ai-prompt-log.md')) && !/\d[\d\s-]{8,}\d/.test(get(f, 'ai-prompt-log.md')),
      (f) => KEPT_QUESTION.test(get(f, 'ai-prompt-log.md')) && !/grace|adeyemi/i.test(get(f, 'ai-prompt-log.md')),
      (f) => /[\w.+-]+@[\w-]+\.[\w.]+/.test(get(f, 'SECURITY.md')) || /security advisor/i.test(get(f, 'SECURITY.md')),
      (f) => /(do not|don't|please do not|never)[^\n.]*(public|issue|post)/i.test(get(f, 'SECURITY.md')),
      (f) => /\d+\s*(business\s+)?(hour|day|week)/i.test(get(f, 'SECURITY.md')),
    ],
  },
];

/** The written-review criterion is scored by the AI coach, not by file checks. */
export const REVIEW_CRITERION = { key: 'review', name: 'Written Security Review' };

export const CRITERION_NAMES = [...CRITERIA.map((c) => c.name), REVIEW_CRITERION.name];

export function bandFor(met, total) {
  if (total > 0 && met === total) return 3;
  if (total > 0 && met / total >= 2 / 3) return 2;
  return met > 0 ? 1 : 0;
}

/** Keeps only known paths and clamps size, so a request cannot smuggle in huge or unexpected content. */
export function cleanFiles(raw) {
  const out = {};
  if (!Array.isArray(raw)) return out;
  for (const f of raw) {
    if (f && typeof f.path === 'string' && typeof f.content === 'string' && f.path.length < 200) {
      out[f.path] = f.content.slice(0, MAX_FILE_CHARS);
    }
  }
  return out;
}

export function scoreFiles(files) {
  return CRITERIA.map((c) => {
    const met = c.checks.filter((t) => { try { return !!t(files); } catch { return false; } }).length;
    const total = c.checks.length;
    return {
      key: c.key,
      assessment_name: c.name,
      met,
      total,
      score: bandFor(met, total),
      // Counts only: naming the missing requirement would hand the answer over, and this is an assessment.
      evidence: `${met} of ${total} requirements met.`,
    };
  });
}

export const isPassing = (scores) => scores.length > 0 && scores.every((s) => (s.score ?? 0) >= 2);
export const averageScore = (scores) => scores.reduce((n, s) => n + (s.score ?? 0), 0) / (scores.length || 1);
